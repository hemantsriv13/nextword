"""Character-level MLP: predict the next character from a window of previous characters, by learning.

    window of n previous characters (ids)
      ──embedding lookup──▶ n vectors of size d ──join──▶ x (n·d numbers)
      ──x·W1 + b1──▶ tanh ──▶ h (hidden layer, H numbers)
      ──h·W2 + b2──▶ logits (one score per character) ──softmax──▶ probabilities
    loss = −ln p(correct next character)  (cross-entropy), lowered by gradient descent:
    every weight moves by −learning rate × its gradient.

Unlike nextword/bigram.py, which counts, this model starts from random weights and changes them to make
the training text more likely. Built with PyTorch on the CPU.

Vocabulary: the characters of the *training* text, plus two special tokens:
    ⟨start⟩  fills the window before the first character of a text part
    ⟨?⟩      stands for a character never seen in training (it can appear in validation or test text)
"""

import hashlib
import math
import random
import struct
import warnings
from dataclasses import asdict, dataclass

# PyTorch warns when NumPy is missing; NextWord doesn't need NumPy.
warnings.filterwarnings("ignore", message="Failed to initialize NumPy")
import torch  # noqa: E402
from torch import nn  # noqa: E402
from torch.nn import functional as F  # noqa: E402

START = "⟨start⟩"
UNKNOWN = "⟨?⟩"
SPECIALS = (START, UNKNOWN)

# Bounds keep a run small enough to train on a laptop CPU in seconds, and to show every number.
LIMITS = {"context": (1, 8), "embed": (2, 32), "hidden": (4, 256), "steps": (1, 20000),
          "batch": (1, 512), "lr": (0.001, 2.0), "seed": (0, 2**31 - 1)}


@dataclass(frozen=True)
class Config:
    context: int = 3       # how many previous characters the model sees
    embed: int = 8         # numbers per character vector
    hidden: int = 64       # hidden-layer size
    steps: int = 2000      # gradient-descent updates
    batch: int = 32        # examples per update
    lr: float = 0.1        # learning rate
    seed: int = 1

    def check(self) -> "Config":
        for name, (lo, hi) in LIMITS.items():
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not lo <= value <= hi:
                raise ValueError(f"{name} must be between {lo} and {hi}")
            if name != "lr" and not float(value).is_integer():
                raise ValueError(f"{name} must be a whole number")
        return self


class Vocab:
    def __init__(self, train_text: str):
        self.itos = list(SPECIALS) + sorted(set(train_text))
        self.stoi = {c: i for i, c in enumerate(self.itos)}

    def __len__(self):
        return len(self.itos)

    def id(self, c: str) -> int:
        return self.stoi.get(c, self.stoi[UNKNOWN])

    def ids(self, text: str) -> list[int]:
        return [self.id(c) for c in text]


def examples(text: str, vocab: Vocab, context: int, first_target: int = 0) -> tuple[torch.Tensor, torch.Tensor]:
    """Every (window, next character) pair inside one text part. Windows never reach outside the part:
    before its first character they are filled with ⟨start⟩. Targets start at `first_target`."""
    ids = vocab.ids(text)
    if len(ids) <= first_target:
        return torch.zeros((0, context), dtype=torch.long), torch.zeros((0,), dtype=torch.long)
    # Padded ids, then every window of `context` ids as a view: example t reads padded[t : t + context].
    padded = torch.tensor([vocab.stoi[START]] * context + ids, dtype=torch.long)
    xs = padded.unfold(0, context, 1)[first_target:len(ids)].contiguous()
    ys = torch.tensor(ids[first_target:], dtype=torch.long)
    return xs, ys


class CharMLP(nn.Module):
    def __init__(self, vocab_size: int, context: int, embed: int, hidden: int):
        super().__init__()
        self.context = context
        self.emb = nn.Embedding(vocab_size, embed)
        self.hidden = nn.Linear(context * embed, hidden)
        self.out = nn.Linear(hidden, vocab_size)

    def forward(self, windows: torch.Tensor) -> torch.Tensor:
        return self.out(torch.tanh(self.hidden(self.emb(windows).flatten(1))))

    def trace(self, window: torch.Tensor) -> dict:
        """One window through the model, keeping every intermediate value."""
        e = self.emb(window.unsqueeze(0))            # 1 × n × d
        x = e.flatten(1)                              # 1 × (n·d)
        pre = self.hidden(x)                          # 1 × H, before tanh
        h = torch.tanh(pre)
        logits = self.out(h)
        probs = F.softmax(logits, dim=1)
        return {"embeddings": e[0], "x": x[0], "pre": pre[0], "h": h[0], "logits": logits[0], "probs": probs[0]}


def build(vocab: Vocab, cfg: Config) -> CharMLP:
    torch.manual_seed(cfg.seed)
    return CharMLP(len(vocab), cfg.context, cfg.embed, cfg.hidden)


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def fingerprint(model: nn.Module) -> str:
    """A short hash of every weight: two checkpoints with the same fingerprint have identical weights."""
    h = hashlib.sha1()
    for name, p in model.state_dict().items():
        values = p.detach().cpu().flatten().tolist()
        h.update(name.encode())
        h.update(struct.pack(f"<{len(values)}f", *values))
    return h.hexdigest()[:12]


@torch.no_grad()
def mean_loss(model: CharMLP, xs: torch.Tensor, ys: torch.Tensor, chunk: int = 16384) -> float | None:
    """Mean cross-entropy over every example, in chunks so a large text never needs all its scores at once."""
    if len(xs) == 0:
        return None
    total = 0.0
    for i in range(0, len(xs), chunk):
        total += F.cross_entropy(model(xs[i:i + chunk]), ys[i:i + chunk], reduction="sum").item()
    return total / len(xs)


def train_step(model: CharMLP, xs: torch.Tensor, ys: torch.Tensor, lr: float, record: bool = False):
    """One plain gradient-descent update on a batch. Returns the batch loss before the update, and with
    record=True also the size (norm) of each weight group's gradient."""
    model.zero_grad()
    loss = F.cross_entropy(model(xs), ys)
    loss.backward()
    norms = {name: p.grad.norm().item() for name, p in model.named_parameters()} if record else None
    with torch.no_grad():
        for p in model.parameters():
            p -= lr * p.grad
    return (loss.item(), norms) if record else loss.item()


@torch.no_grad()
def generate(model: CharMLP, vocab: Vocab, prompt: str, length: int, seed: int) -> list[dict]:
    """Sample `length` characters after `prompt`. Returns one step per character with its window,
    the top probabilities, the random draw and the choice. ⟨start⟩ and ⟨?⟩ are never sampled."""
    rng = random.Random(seed)
    ids = vocab.ids(prompt)
    steps = []
    banned = [vocab.stoi[s] for s in SPECIALS]
    for _ in range(length):
        window = ([vocab.stoi[START]] * model.context + ids)[-model.context:]
        probs = F.softmax(model(torch.tensor([window])), dim=1)[0]
        probs[banned] = 0
        probs = probs / probs.sum()
        draw = rng.random()
        cumulative, choice = 0.0, len(probs) - 1
        for i, p in enumerate(probs.tolist()):
            cumulative += p
            if draw < cumulative:
                choice = i
                break
        top = torch.topk(probs, min(5, len(probs)))
        steps.append({"window": [vocab.itos[i] for i in window], "draw": draw, "token": vocab.itos[choice],
                      "p": probs[choice].item(),
                      "top": [{"token": vocab.itos[i], "p": p} for p, i in zip(top.values.tolist(), top.indices.tolist())]})
        ids.append(choice)
    return steps


def save(path, model: CharMLP, vocab: Vocab, cfg: Config, extra: dict | None = None) -> None:
    torch.save({"format": "nextword-char-mlp-1", "config": asdict(cfg), "vocab": vocab.itos,
                "state": model.state_dict(), "extra": extra or {}}, path)


def load(path) -> tuple[CharMLP, Vocab, Config, dict]:
    blob = torch.load(path, map_location="cpu", weights_only=True)
    if blob.get("format") != "nextword-char-mlp-1":
        raise ValueError("not a NextWord MLP file")
    cfg = Config(**blob["config"])
    vocab = Vocab("")
    vocab.itos = list(blob["vocab"])
    vocab.stoi = {c: i for i, c in enumerate(vocab.itos)}
    model = CharMLP(len(vocab), cfg.context, cfg.embed, cfg.hidden)
    model.load_state_dict(blob["state"])
    return model, vocab, cfg, blob.get("extra", {})


def nats_to_perplexity(nll: float | None) -> float | None:
    return math.exp(nll) if nll is not None and nll < 700 else None
