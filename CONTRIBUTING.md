# Contributing

Thanks for improving Schedule Viewer. Keep changes local-first, static-hosting compatible and independent of any real person's timetable.

## Before opening a pull request

1. Do not add personal schedules, institution-specific defaults or unlicensed images.
2. Preserve the YAML v4 normalization boundary and IndexedDB asset model.
3. Add or update focused contracts for behavior changes.
4. Run the validation barrier:

```bash
python tools/audit_public_tree.py
python tools/validate_config.py
python tests/config-v4.test.py
npm test
python tools/build.py --out dist
npm run test:e2e
npx playwright test --config=playwright.apple.config.mjs
```

For visual changes, inspect phone portrait, phone landscape and desktop in both color schemes. Motion changes must also be checked with Reduce Motion and under interrupted navigation.

## Generated files

- Do not commit `dist/`, test reports or browser traces.
- Commit README screenshots only when the visible interface changes.
- Regenerate the deterministic public and visual-review captures after UI changes.
- Run `python tools/render_app_icons.py` after changing the icon renderer.

## Scope

Prefer small commits with one concern. Avoid introducing a backend, telemetry or a framework dependency unless the architecture change has been discussed first.
