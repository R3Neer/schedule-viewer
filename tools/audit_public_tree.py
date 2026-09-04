#!/usr/bin/env python3
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def text(*codepoints: int) -> str:
    return "".join(map(chr, codepoints))


FORBIDDEN = (
    text(85, 67, 77),
    text(83, 97, 109, 117, 101, 108),
    text(65, 117, 108, 97, 32, 57),
    text(85, 110, 105, 118, 101, 114, 115, 105, 100, 97, 100, 32, 67, 111, 109, 112, 108, 117, 116, 101, 110, 115, 101),
    text(105, 110, 102, 111, 114, 109, 97, 116, 105, 99, 97, 46, 117, 99, 109, 46, 101, 115),
    text(117, 99, 109, 45, 115, 99, 104, 101, 100, 117, 108, 101, 114),
)


def main() -> None:
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode("utf-8").split("\0")
    hits: list[str] = []
    for relative in filter(None, tracked):
        path = ROOT / relative
        try:
            source = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        lowered = source.casefold()
        for token in FORBIDDEN:
            if token.casefold() in lowered:
                hits.append(f"{relative}: contiene un identificador privado heredado")
                break
    if hits:
        raise SystemExit("El árbol público contiene datos heredados:\n" + "\n".join(f"- {item}" for item in hits))
    print(f"public-tree audit: OK ({len(tracked)} rutas rastreadas)")


if __name__ == "__main__":
    main()
