#!/usr/bin/env python3
from __future__ import annotations
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("validate_config", ROOT / "tools" / "validate_config.py")
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(module)


def errors_for(descriptor, expected_view="day", generated_assets=None):
    errors = []
    module.validate_content(
        descriptor,
        "test.content",
        errors,
        generated_assets or set(),
        expected_view,
    )
    return errors


assert not errors_for({
    "type": "image",
    "src": "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    "fit": "cover",
    "alt": "GIF"
})

assert errors_for({"type": "image", "src": "", "fit": "contain"})
assert errors_for({"type": "image", "src": "assets/no-existe.gif", "fit": "contain"})
assert errors_for({"type": "image", "src": "data:image/png;base64,AAAA", "fit": "warp-speed"})
assert errors_for({"type": "generated-schedule", "view": "week"}, expected_view="day")
assert not errors_for({"type": "generated-schedule", "view": "day"}, expected_view="day")
assert not errors_for("data:image/png;base64,AAAA")

print("validate-content-config: contratos image/generated y errores esperados OK")
