# Schedule Viewer

A lightweight, offline-first web app for displaying a timetable based on the current date and screen orientation.

The runtime is intentionally generic. The repository currently contains Samuel's 2026–2027 Computer Science timetable at UCM as its configuration, but the application itself is not tied to UCM.

## What it does

- Portrait mobile view shows the current day.
- Landscape mobile, tablet and desktop views show the week.
- Academic calendars support terms, holidays, non-teaching days and vacation periods.
- The view changes automatically when the phone is rotated.
- Custom visual content can replace generated timetable views.
- GIF, PNG, JPEG, WebP, SVG and AVIF work through the same image renderer.
- A Service Worker precaches the app and local visual assets so it can reopen offline after the first online load.
- The UI deliberately keeps a single visible `<img>` and no permanent navigation controls.

## Architecture

The application separates **when something should be shown** from **how it is rendered**:

```text
date + orientation
       ↓
schedule-core.js
       ↓
ContentDescriptor
       ↓
content-renderer.js
   ┌───────────────┐
   │               │
generated       image
schedule        content
   │               │
  SVG        GIF/PNG/...
   └───────┬───────┘
           ↓
         <img>
```

`generated-schedule` keeps the current timetable behaviour. On phones the timetable is rendered dynamically as SVG to fit the viewport; desktop and tablet use reproducibly generated WebP assets with SVG fallback.

`image` lets a day, week or state point directly to visual content without changing the calendar logic.

The configurable content format is documented in [`docs/content-config.md`](docs/content-config.md).

## Configuration

`config/schedules.json` is the source of truth for:

- academic years and terms;
- subjects and weekly sessions;
- rooms and groups;
- holidays and non-teaching days;
- vacation periods and term transitions;
- generated asset paths;
- optional custom visual content.

The UCM-specific timetable and official source URLs live only in this configuration layer.

## Offline support

The Service Worker precaches:

- the HTML, CSS and JavaScript runtime;
- `config/schedules.json`;
- generated timetable WebP assets;
- local custom images referenced by the configuration.

Navigation and configuration use network-first behaviour with cached fallback. Static runtime files and images use cache-first behaviour.

Changing the cache namespace/version replaces stale app caches on activation.

## Development

```bash
python -m pip install -r requirements.txt
npm install
python tools/validate_config.py
python tests/validate_content_config.py
npm test
python tools/build.py --out dist
npm run test:e2e
```

The end-to-end suite starts the built `dist/` site and opens it in Chromium. The CI does not deploy until the built application itself has rendered successfully in a real browser.

For development and tests, a date can be overridden with:

```text
http://localhost:4173/?date=2027-02-03
```

The date override is not exposed as a normal UI control.

## Tests and CI

GitHub Actions currently verifies, before deployment:

- structural calendar validation;
- valid and invalid `ContentDescriptor` contracts;
- schedule/content selection unit tests;
- renderer contracts;
- Service Worker asset discovery;
- a reproducible production build;
- real browser rendering on phone and desktop viewports;
- portrait ↔ landscape switching without reload;
- absence of unwanted mobile scrolling;
- GIF and PNG custom content;
- offline reload on mobile;
- offline WebP delivery on desktop.

Only the same `dist/` artifact that passes those checks is uploaded to GitHub Pages.

## Adding another timetable

The runtime should not need to change for another university or academic year. Add or replace the relevant calendar, subjects, sessions and optional content in `config/schedules.json`, then run the validator and tests.

The current repository remains a configured UCM instance, while the runtime is designed to support other schedules without UCM-specific code.
