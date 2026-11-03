"""Checks used by start-nextword.cmd before it starts the Lab. They only read; they never start, stop or
switch anything.

    python -m nextword.lab.startup ai      READY <model> | LOADING | OFF   (exit 0 | 3 | 4)
    python -m nextword.lab.startup torch   READY <version> | MISSING        (exit 0 | 4)

"ai" tells three states apart, because the Colibri launcher stops any running server before it starts one:
    READY    Colibri answers on 127.0.0.1:8000 and serves a model: reuse it as it is.
    LOADING  something is listening on the port but doesn't list a model yet (Colibri loading, or another
             program): leave it alone; starting the launcher now would stop it.
    OFF      nothing is listening: starting the launcher is safe.
"""

import json
import socket
import sys
import urllib.request
from urllib.parse import urlparse

from nextword.lab import assist


def ai_state(url: str = assist.DEFAULT_URL, timeout: float = 2.0) -> tuple[str, str]:
    u = urlparse(url)
    try:
        with socket.create_connection((u.hostname, u.port or 80), timeout=timeout):
            pass
    except OSError:
        return "OFF", ""
    try:
        with urllib.request.urlopen(url + "/models", timeout=timeout) as res:
            models = [m.get("id", "") for m in json.loads(res.read().decode("utf-8")).get("data", [])]
    except (OSError, ValueError):
        return "LOADING", ""
    return ("READY", models[0]) if models else ("LOADING", "")


def main(argv: list[str]) -> int:
    what = argv[1] if len(argv) > 1 else ""
    if what == "ai":
        state, model = ai_state()
        print(state, model)
        return {"READY": 0, "LOADING": 3, "OFF": 4}[state]
    if what == "torch":
        try:
            import warnings
            warnings.filterwarnings("ignore")
            import torch
        except ImportError:
            print("MISSING")
            return 4
        print("READY", torch.__version__)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
