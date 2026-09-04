#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from config_v3 import ConfigError, compile_yaml

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "schedule.yaml"


def main() -> None:
    try:
        config = compile_yaml(CONFIG)
    except ConfigError as error:
        raise SystemExit(f"validate-config: ERROR\n{error}") from error

    print(
        "validate-config: OK "
        f"(v{config['version']}, {len(config['views'])} vistas, "
        f"{len(config['rules'])} reglas, {len(config['academicYears'])} curso)"
    )


if __name__ == "__main__":
    main()
