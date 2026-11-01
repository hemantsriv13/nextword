"""Training texts for the MLP at three clearly labelled levels, each with fixed train / validation / test parts.

    tiny     short teaching texts written for this project (data/teaching/tiny.json, in the repository):
             small enough to read every example and every number
    medium   a practice passage: one public-domain book, split by whole chapters
    large    two public-domain books, split by whole chapters (about 1 MB)

Medium and large are prepared from Project Gutenberg plain-text files that are downloaded once, outside the
repository, into $NEXTWORD_DATASETS (default: LocalAI/datasets on drive D: if present, else ~/LocalAI/datasets):

    python -m nextword.datasets download      fetch the raw books and check their SHA-256
    python -m nextword.datasets prepare       write prepared/<id>/{train,val,test}.txt and manifest.json

Preparation (recorded in each manifest): keep only the text between Gutenberg's START and END markers, drop the
front matter, illustration captions and chapter headings, join wrapped lines into one line per paragraph, map
curly quotes, dashes and accented letters to plain ASCII, and remove anything else outside printable ASCII.

Splits are made from whole chapters (stories, for the Sherlock Holmes book), never from the middle of one, so no
passage is cut across two parts. After splitting, any validation or test paragraph that repeats a training
paragraph, or shares a run of 12 words with one, is removed (and counted), so held-out text is not text the
model has already seen.

This text trains only the Lab's small MLP. It does not train, change or fine-tune the explanation model (Qwen).
"""

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TINY_PATH = ROOT / "data" / "teaching" / "tiny.json"
def _default_home() -> Path:
    """$NEXTWORD_DATASETS if set; else LocalAI/datasets on drive D: if that folder exists (the author's second
    drive); else ~/LocalAI/datasets. Large files never go inside the repository."""
    if os.environ.get("NEXTWORD_DATASETS"):
        return Path(os.environ["NEXTWORD_DATASETS"])
    second_drive = Path(r"D:\LocalAI\datasets")
    return second_drive if second_drive.exists() else Path.home() / "LocalAI" / "datasets"


DEFAULT_HOME = _default_home()

LICENSE = ("Public domain in the United States (Project Gutenberg); the authors died more than 90 years ago, so also "
           "public domain in India, the UK and the EU. Gutenberg's header, footer and licence text are removed, as its "
           "licence allows for public-domain texts.")

SOURCES = {
    "pg11": {"title": "Alice's Adventures in Wonderland", "author": "Lewis Carroll (1832-1898)", "published": 1865,
             "url": "https://www.gutenberg.org/cache/epub/11/pg11.txt",
             "sha256": "01b38ea4c710a84bc18d0bd41271a5a1a92b94e97b2812f4dece97d4a694725e",
             "heading": r"CHAPTER [IVXLC]+\.", "title_line": True},
    "pg1342": {"title": "Pride and Prejudice", "author": "Jane Austen (1775-1817)", "published": 1813,
               "url": "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
               "sha256": "3f6bb9d6f78e0293b56acd4714dd68cb7d6d1d293402031ce9d5a216bcaf9d75",
               "heading": r"CHAPTER [IVXLC]+\.", "title_line": False},
    "pg1661": {"title": "The Adventures of Sherlock Holmes", "author": "Arthur Conan Doyle (1859-1930)", "published": 1892,
               "url": "https://www.gutenberg.org/cache/epub/1661/pg1661.txt",
               "sha256": "922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0",
               "heading": r"[IVX]+\. [A-Z][A-Z’' -]+", "title_line": False},
}

# Which chapters go where. Contiguous blocks: the end of a book is held out, as a later chapter would be.
DATASETS = {
    "medium-alice": {"level": "medium", "name": "Alice (medium practice passage)",
                     "books": {"pg11": {"train": (1, 3), "val": (4, 4), "test": (5, 5)}},
                     "about": "Chapters 1-3 of Alice's Adventures in Wonderland to train on, chapter 4 to validate, chapter 5 to test."},
    "large-austen-doyle": {"level": "large", "name": "Austen + Doyle (large corpus)",
                           "books": {"pg1342": {"train": (1, 49), "val": (50, 55), "test": (56, 61)},
                                     "pg1661": {"train": (1, 10), "val": (11, 11), "test": (12, 12)}},
                           "about": "Pride and Prejudice chapters 1-49 and Sherlock Holmes stories 1-10 to train on; "
                                    "chapters 50-55 and story 11 to validate; chapters 56-61 and story 12 to test."},
}

ASCII_MAP = {"\u201c": '"', "\u201d": '"', "\u2018": "'", "\u2019": "'", "\u2014": " - ", "\u2013": "-",
             "\u00e6": "ae", "\u0153": "oe", "\u00a3": "L", "\u00bd": "1/2", "\u00b7": ""}
SHINGLE_WORDS = 12


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# ----------------------------------------------------------------------------- cleaning

def body(raw: str) -> str:
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    start = re.search(r"^\*\*\* START OF THE PROJECT GUTENBERG EBOOK .*\*\*\*$", raw, re.M)
    end = re.search(r"^\*\*\* END OF THE PROJECT GUTENBERG EBOOK .*\*\*\*$", raw, re.M)
    if not start or not end:
        raise ValueError("no Project Gutenberg START/END markers")
    return raw[start.end():end.start()]


def to_ascii(text: str) -> tuple[str, int]:
    """Map typographic characters to ASCII. Returns the text and how many characters were dropped."""
    out, dropped = [], 0
    for ch in text:
        ch = ASCII_MAP.get(ch, ch)
        if len(ch) == 1 and ord(ch) > 126:
            base = unicodedata.normalize("NFKD", ch).encode("ascii", "ignore").decode()
            if base:
                ch = base
            else:
                dropped += 1
                continue
        out.append(ch)
    return "".join(out), dropped


def chapters(text: str, source: dict) -> list[str]:
    """The book's chapters in order, each as paragraphs joined by '\\n', without headings or captions."""
    # Illustration captions: drop them, but keep a chapter heading printed inside one (Pride and Prejudice ch. 1).
    def caption(m):
        inner = m.group(1)
        heading = re.search(r"chapter\s+([IVXLC]+)\.", inner, re.I)
        return f"\nCHAPTER {heading.group(1).upper()}.\n" if heading else "\n"
    text = re.sub(r"\[_?Copyright[^\]]*\]", "", text)  # nested inside captions in Pride and Prejudice
    text = re.sub(r"\[Illustration:?(.*?)\]", caption, text, flags=re.S)
    text = re.sub(r"/\*\s*(?:[A-Z]+\b)?\s*(.*?)\s*\*/", r"\1", text, flags=re.S)  # letter layout markers: keep the words
    text = re.sub(r"(?im)^\s*chapter\s+([ivxlc]+)\.?\s*$", lambda m: f"CHAPTER {m.group(1).upper()}.", text)
    heads = list(re.finditer(rf"^{source['heading']}$", text, re.M))
    out = []
    for i, h in enumerate(heads):
        chunk = text[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(text)]
        paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", chunk)]
        paras = [p for p in paras if p]
        if source["title_line"] and paras:
            paras = paras[1:]  # Alice prints the chapter's title on the line after its number
        paras = [p for p in paras if not re.fullmatch(r"[IVXLC]+\.|[* ]+", p)]  # Holmes's section numbers, Alice's * * * breaks
        paras = [p.replace("_", "") for p in paras]  # _italics_
        out.append("\n".join(paras))
    return out


def _norm(p: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", p.lower()).split())


def _shingles(p: str) -> set[str]:
    w = _norm(p).split()
    return {" ".join(w[i:i + SHINGLE_WORDS]) for i in range(len(w) - SHINGLE_WORDS + 1)}


def remove_overlap(held: list[str], seen: list[str]) -> tuple[list[str], dict]:
    """Drop held-out paragraphs that repeat, or share a 12-word run with, a paragraph in `seen`."""
    exact = {_norm(p) for p in seen}
    runs = set().union(*(_shingles(p) for p in seen)) if seen else set()
    kept, dup, shared = [], 0, 0
    for p in held:
        if _norm(p) in exact:
            dup += 1
        elif _shingles(p) & runs:
            shared += 1
        else:
            kept.append(p)
    return kept, {"repeatedParagraphs": dup, "shared12WordRuns": shared}


# ----------------------------------------------------------------------------- building a dataset

def build(dataset_id: str, raw_dir: Path) -> tuple[dict, dict]:
    spec = DATASETS[dataset_id]
    parts = {"train": [], "val": [], "test": []}
    books, dropped = [], 0
    for book_id, ranges in spec["books"].items():
        src = SOURCES[book_id]
        path = raw_dir / f"{book_id}.txt"
        digest = sha256(path)
        if digest != src["sha256"]:
            raise ValueError(f"{path} has SHA-256 {digest}, expected {src['sha256']}")
        clean, n = to_ascii(body(path.read_text(encoding="utf-8")))
        dropped += n
        chs = chapters(clean, src)
        for split, (a, b) in ranges.items():
            if b > len(chs):
                raise ValueError(f"{book_id} has {len(chs)} chapters, not {b}")
            for ch in chs[a - 1:b]:
                parts[split] += ch.split("\n")
        books.append({"id": book_id, "title": src["title"], "author": src["author"], "published": src["published"],
                      "url": src["url"], "sha256": digest, "chapters": len(chs),
                      "split": {k: f"{'chapters' if book_id != 'pg1661' else 'stories'} {a}-{b}" for k, (a, b) in ranges.items()}})
    overlap = {}
    parts["val"], overlap["val"] = remove_overlap(parts["val"], parts["train"])
    parts["test"], overlap["test"] = remove_overlap(parts["test"], parts["train"] + parts["val"])
    texts = {k: "\n".join(v) + "\n" for k, v in parts.items()}
    manifest = {
        "id": dataset_id, "level": spec["level"], "name": spec["name"], "about": spec["about"], "license": LICENSE,
        "sources": books,
        "preprocessing": ["text between the Gutenberg START and END markers only", "front matter before chapter 1 removed",
                          "illustration captions, copyright notes of the illustrations, chapter headings, scene breaks (* * *) and letter layout markers (/* ... */) removed", "wrapped lines joined: one line per paragraph",
                          "_italic_ underscores removed",
                          "curly quotes to straight quotes, dashes to '-', accented letters to plain letters (e.g. é to e)",
                          f"{dropped} other characters outside printable ASCII removed",
                          f"validation and test paragraphs that repeat a training paragraph, or share a run of {SHINGLE_WORDS} words with one, removed"],
        "overlapRemoved": overlap,
        "chars": {k: len(v) for k, v in texts.items()},
        "paragraphs": {k: len(v) for k, v in parts.items()},
        "distinctChars": len(set("".join(texts.values()))),
        "sha256": {k: hashlib.sha256(v.encode()).hexdigest() for k, v in texts.items()},
        "trainsOnly": "the Lab's small character MLP (and the bigram counts it is compared with); it does not train, change or fine-tune the explanation model (Qwen)",
    }
    return texts, manifest


def prepare(home: Path = DEFAULT_HOME) -> list[dict]:
    raw, out = home / "gutenberg" / "raw", home / "prepared"
    done = []
    for dataset_id in DATASETS:
        texts, manifest = build(dataset_id, raw)
        d = out / dataset_id
        d.mkdir(parents=True, exist_ok=True)
        for k, v in texts.items():
            (d / f"{k}.txt").write_text(v, encoding="utf-8", newline="\n")
        (d / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
        done.append(manifest)
    return done


def download(home: Path = DEFAULT_HOME) -> list[str]:
    raw = home / "gutenberg" / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    out = []
    for book_id, src in SOURCES.items():
        path = raw / f"{book_id}.txt"
        if not path.exists() or sha256(path) != src["sha256"]:
            with urllib.request.urlopen(src["url"], timeout=60) as r:  # noqa: S310 - fixed https URLs above
                path.write_bytes(r.read())
        digest = sha256(path)
        if digest != src["sha256"]:
            raise ValueError(f"{path}: SHA-256 {digest} does not match {src['sha256']}; the file on Gutenberg changed")
        out.append(f"{path} ok")
    return out


# ----------------------------------------------------------------------------- reading datasets in the Lab

def tiny() -> dict[str, dict]:
    data = json.loads(TINY_PATH.read_text(encoding="utf-8"))
    return {d["id"]: d for d in data["datasets"]}


def prepared(home: Path = DEFAULT_HOME) -> dict[str, dict]:
    """Prepared medium and large datasets found on disk: id → manifest (with its folder)."""
    out = {}
    root = home / "prepared"
    for dataset_id in DATASETS:
        m = root / dataset_id / "manifest.json"
        if m.exists():
            out[dataset_id] = {**json.loads(m.read_text(encoding="utf-8")), "dir": str(m.parent)}
    return out


def parts_of(manifest: dict) -> dict[str, str]:
    d = Path(manifest["dir"])
    return {k: (d / f"{k}.txt").read_text(encoding="utf-8") for k in ("train", "val", "test")}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m nextword.datasets", description=__doc__.split("\n")[0])
    p.add_argument("command", choices=["download", "prepare", "list"])
    p.add_argument("--home", type=Path, default=DEFAULT_HOME, help=f"dataset folder (default {DEFAULT_HOME})")
    a = p.parse_args(argv)
    if a.command == "download":
        print("\n".join(download(a.home)))
    elif a.command == "prepare":
        for m in prepare(a.home):
            print(f"{m['id']}: train {m['chars']['train']:,} chars, val {m['chars']['val']:,}, test {m['chars']['test']:,}; "
                  f"{m['distinctChars']} distinct characters; overlap removed {m['overlapRemoved']}")
    else:
        for k, m in {**tiny(), **prepared(a.home)}.items():
            print(k, m.get("level"), m.get("name"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
