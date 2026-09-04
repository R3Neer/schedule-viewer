#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from config_v3 import compile_yaml, dump_compiled_json

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Compila config/schedule.yaml al JSON interno v3.")
    parser.add_argument("--source", default=str(ROOT / "config" / "schedule.yaml"))
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    config = compile_yaml(Path(args.source))
    output = Path(args.out)
    dump_compiled_json(config, output)
    print(f"Configuración v3 compilada en {output}")


if __name__ == "__main__":
    main()
