# Schedule Viewer

A lightweight, offline-first timetable viewer driven by a human-friendly YAML configuration.

The runtime is generic. This repository currently contains Samuel's 2026–2027 Computer Science timetable at UCM, but the application itself is not tied to UCM, weekends, university terms, or a fixed daily/weekly layout.

## What changed in v3

`config/schedule.yaml` is now the **only human-edited source of truth**.

The build validates and compiles it to:

```text
dist/config/schedule.json
```

The browser never parses YAML. This keeps the runtime small while making the configuration pleasant to edit.

The v3 engine separates:

```text
date + viewport + manual interaction
              ↓
          view profile
              ↓
          time range
              ↓
        calendar state
              ↓
         content rule
              ↓
           renderer
```

That means none of these are hardcoded anymore:

- Saturday + Sunday as the weekend.
- Portrait = day.
- Landscape = week.
- Desktop = week.
- A single generic image for every inactive date.

## Views and ranges

A view can use:

- `day`
- `week`
- `month`
- `year`
- `relative`
- `rolling`
- `interval`

The current configuration preserves the original behavior:

```text
phone portrait    → current day
phone landscape   → current week
tablet / wide     → current week
desktop default   → horizontal weekly view
desktop Space     → toggle weekly ↔ daily
```

On desktop, `Space` only toggles views when focus is not inside an editable or interactive control.

## Inactive days

Recurring inactive weekdays are configurable:

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

Every inactive date is guaranteed to have an image because this is required:

```yaml
calendar:
  inactive:
    default_image:
      src: assets/states/no-class-today-vertical.webp
      alt: Sin clases hoy
```

More specific images can override it for:

1. an exact inactive date;
2. a holiday;
3. a vacation/non-teaching period;
4. a recurring inactive weekday;
5. otherwise the global default image.

## Custom images

Image descriptors work anywhere content can be configured:

```yaml
image:
  src: assets/inactive/christmas.gif
  alt: Navidad
  fit: contain
```

GIF, PNG, JPEG, WebP, SVG and AVIF are handled by the browser through the same `<img>` renderer.

## Development

```bash
python -m pip install -r requirements.txt
npm install

python tools/validate_config.py
python tests/config-v3.test.py
npm test

python tools/build.py --out dist
npm run test:e2e
```

To compile only the YAML:

```bash
python tools/compile_config.py --out test-output/schedule.json
```

To preview a specific date after building:

```text
http://localhost:4173/?date=2026-09-09
```

## Tests

CI blocks deployment unless all of these pass:

- YAML v3 schema and negative validation tests;
- calendar/range/view/rule unit contracts;
- renderer contracts;
- Service Worker cache discovery and migration contracts;
- real Chromium E2E against the exact `dist/` artifact;
- desktop keyboard toggling;
- mobile orientation switching;
- configurable inactive weekdays;
- per-date/per-holiday/per-period image precedence;
- month/relative/arbitrary interval views;
- offline reload and offline desktop Space toggling.

## GitHub Pages

`.github/workflows/pages.yml` builds `dist/`, opens it in Chromium, runs the full test suite, and only uploads the Pages artifact if everything is green.

## Configuration reference

See [`docs/config-v3.md`](docs/config-v3.md).
