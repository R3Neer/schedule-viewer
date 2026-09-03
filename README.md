# Schedule Viewer

A lightweight, offline-first timetable viewer with a neutral demo and local, per-device customization.

Schedule Viewer is not tied to a university, a fixed weekend, or a daily/weekly layout. The repository ships only generic demonstration data. Your real schedule and custom images stay in your browser unless you explicitly export them.

## How it works

Open the app and use **Ajustes** to customize it. No account, backend or repository editing is required.

- On touch devices, configure the **Vertical** and **Horizontal** views.
- On desktop, configure **Principal** and **Secundaria**. `Space` toggles between them by default.
- Choose day, week, month, year, rolling, relative or absolute interval ranges.
- Configure any recurring inactive weekdays, including none at all.
- Replace the default inactive image or add images for specific dates, holidays and periods.
- Use PNG, JPEG, GIF, WebP, SVG or AVIF images supported by the browser.

The regular UI stores the normalized configuration and local image assets in **IndexedDB**. The static application remains deployable on GitHub Pages and works offline through its Service Worker.

## Local data and backups

Schedule Viewer is local-first:

```text
static app + neutral demo
          ↓
      Ajustes UI
          ↓
IndexedDB configuration + Blob assets
          ↓
      rendered view
```

A complete **`.schedule`** backup contains both configuration and local assets. You can export it on one device and import it on another. There are also YAML-only import/export controls for advanced users.

The app never silently uploads your local schedule or images anywhere.

## YAML

The repository still uses a human-readable YAML source for the neutral demo:

```text
config/schedule.yaml
        ↓ build
 dist/config/schedule.json
```

The normal runtime does not load a YAML parser. The CodeMirror 6 + Lezer editor and YAML tooling are lazy-loaded only when **Avanzado → Editar YAML** is opened.

The same v3 schema supports configurable views, calendar policy, ranges and content rules. See [`docs/config-v3.md`](docs/config-v3.md) for the full configuration reference.

## Views and ranges

A view can use:

- `day`
- `week`
- `month`
- `year`
- `relative`
- `rolling`
- `interval`

The neutral demo starts with behavior similar to a conventional timetable:

```text
touch portrait     → current day
touch landscape    → current week
desktop Principal  → current week
desktop Secundaria → current day
desktop Space      → toggle Principal ↔ Secundaria
```

These are defaults, not hardcoded policy.

## Inactive days

Recurring inactive weekdays are configurable. For example:

```yaml
calendar:
  inactive_weekdays:
    - saturday
    - sunday
```

Only Sunday:

```yaml
calendar:
  inactive_weekdays:
    - sunday
```

No recurring inactive weekdays:

```yaml
calendar:
  inactive_weekdays: []
```

A required default inactive image guarantees that every inactive date remains renderable. More specific date, holiday, period or weekday images can override it.

## Migration from v3

When upgrading an existing v3 installation, v4 looks for the previous `schedule-viewer-offline-v3` cache before cleaning it up. If present, it migrates the cached configuration and referenced timetable images into IndexedDB atomically.

The old cache is removed only after the local migration succeeds. This prevents an update from replacing an existing personalized timetable with the public demo merely because the storage model changed.

## Development

```bash
python -m pip install -r requirements.txt
npm install --no-audit --no-fund

python tools/validate_config.py
python tests/config-v3.test.py
npm test

python tools/build.py --out dist
npm run test:e2e
```

To compile only the demo YAML:

```bash
python tools/compile_config.py --out test-output/schedule.json
```

To preview a specific date after building:

```text
http://localhost:4173/?date=2026-09-09
```

## Tests and deployment

CI blocks deployment unless the complete artifact passes validation, unit tests, build checks and Chromium E2E. The suite covers, among other things:

- YAML schema and negative validation contracts;
- calendar, ranges, views and content rules;
- the complete static ES-module graph;
- IndexedDB configuration, Blob assets and atomic writes;
- `.schedule` backup/restore;
- lazy YAML editor boundaries;
- touch/desktop UI behavior and keyboard accessibility;
- real generated WebP assets;
- offline reload and view toggling;
- lossless v3 cache migration.

`.github/workflows/pages.yml` uploads and deploys the Pages artifact only for a successful push to `main`. Branch pushes and pull requests run the same verification without publishing them.
