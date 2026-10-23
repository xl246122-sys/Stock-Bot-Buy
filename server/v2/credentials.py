"""Local key loading with no logging or serialization."""
import re
from pathlib import Path


def load_deepseek_key(path: Path) -> str:
    content = path.read_text(encoding="utf-8-sig").strip()
    matches = set(re.findall(r"\bsk-[A-Za-z0-9_-]{16,}\b", content))
    if len(matches) != 1:
        raise ValueError("expected_exactly_one_deepseek_key")
    return matches.pop()
