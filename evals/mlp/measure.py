"""Measure MLP training time and memory on this computer, for choosing dataset sizes and default settings.

    .venv\\Scripts\\python -m evals.mlp.measure [--steps 2000] [--out evals/mlp/results/measure-<date>.json]

Each configuration trains in a fresh process (so peak memory is that run's alone) through the Lab's own
MLPService, on the tiny, medium and large datasets. Peak memory is the process's peak working set (Windows).
"""

import argparse
import ctypes
import json
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

CONFIGS = [
    {"corpus": "ds-tiny-cat", "context": 3, "embed": 8, "hidden": 64, "batch": 32},
    {"corpus": "ds-medium-alice", "context": 3, "embed": 8, "hidden": 64, "batch": 32},
    {"corpus": "ds-medium-alice", "context": 5, "embed": 12, "hidden": 128, "batch": 64},
    {"corpus": "ds-large-austen-doyle", "context": 3, "embed": 8, "hidden": 64, "batch": 32},
    {"corpus": "ds-large-austen-doyle", "context": 5, "embed": 12, "hidden": 128, "batch": 64},
    {"corpus": "ds-large-austen-doyle", "context": 8, "embed": 16, "hidden": 256, "batch": 128},
    {"corpus": "ds-large-austen-doyle", "context": 8, "embed": 16, "hidden": 256, "batch": 128, "steps": 20000},
]


class PMC(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t), ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t), ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]


def peak_mb() -> float:
    c = PMC()
    c.cb = ctypes.sizeof(PMC)
    k32, psapi = ctypes.WinDLL("kernel32"), ctypes.WinDLL("psapi")
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
    if not psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(c), c.cb):
        raise OSError("GetProcessMemoryInfo failed")
    return c.PeakWorkingSetSize / 2**20


def one(cfg: dict, steps: int) -> dict:
    import tempfile

    from nextword.lab import mlp_service, service
    base = peak_mb()
    with tempfile.TemporaryDirectory() as tmp:
        svc = mlp_service.MLPService(service.CorpusStore(Path(tmp) / "u"), Path(tmp) / "mlp")
        t0 = time.perf_counter()
        steps = cfg.pop("steps", steps)
        summary = svc.start({**cfg, "steps": steps, "lr": 0.1, "seed": 1})
        setup = time.perf_counter() - t0
        run = svc.get(summary["id"])
        while run.state == "training":
            time.sleep(0.05)
        t1 = time.perf_counter()
        cmp = svc.compare({"run": run.id})
        compare_s = time.perf_counter() - t1
        val = next(r for r in cmp["rows"] if r["part"] == "val")
        return {**cfg, "steps": steps, "state": run.state, "examples": summary["examples"], "vocab": summary["vocabSize"],
                "params": summary["params"], "setupSeconds": round(setup, 2), "trainSeconds": round(run.train_seconds, 2),
                "msPerStep": round(run.ms_per_step, 3), "compareSeconds": round(compare_s, 2),
                "valLoss": {"mlpInitial": val["mlp_initial"], "mlpTrained": val["mlp_trained"], "bigramAdd1": val["bigram_add1"]},
                "curveEnd": run.curve[-1], "peakMB": round(peak_mb(), 1), "peakMBBeforeRun": round(base, 1)}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--steps", type=int, default=2000)
    p.add_argument("--one", help=argparse.SUPPRESS)
    p.add_argument("--out", type=Path)
    a = p.parse_args()
    if a.one:
        print(json.dumps(one(json.loads(a.one), a.steps)))
        return 0
    rows = []
    for cfg in CONFIGS:
        out = subprocess.run([sys.executable, "-m", "evals.mlp.measure", "--steps", str(a.steps), "--one", json.dumps(cfg)],
                             capture_output=True, text=True, check=True)
        row = json.loads(out.stdout.strip().splitlines()[-1])
        rows.append(row)
        print(f"{row['corpus']:24} ctx {row['context']} emb {row['embed']:2} hid {row['hidden']:3} batch {row['batch']:3}: "
              f"{row['trainSeconds']:6.2f} s train ({row['msPerStep']} ms/step), setup {row['setupSeconds']} s, compare {row['compareSeconds']} s, "
              f"peak {row['peakMB']} MB, val {row['valLoss']}", flush=True)
    out = a.out or Path("evals/mlp/results") / f"measure-{time.strftime('%Y%m%d-%H%M%S')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"steps": a.steps, "torchThreads": 2, "rows": rows}, indent=1), encoding="utf-8")
    print("saved", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
