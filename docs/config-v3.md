# Schedule Viewer v3 configuration

Schedule Viewer v3 has one configuration model and two normal ways to edit it:

- the visual **Settings** UI for common options;
- YAML for advanced editing, import/export and source-controlled demos.

The public repository's human-edited demo lives in:

```text
config/schedule.yaml
```

During the build it is validated and compiled to:

```text
dist/config/schedule.json
```

Normal application startup consumes the compiled JSON and does **not** parse YAML. YAML parsing is loaded in the browser only when the user explicitly imports YAML or opens the advanced CodeMirror editor.

A user's active configuration does not have to live in the repository. The public app stores personal configuration and image assets locally in IndexedDB. See [`local-config.md`](local-config.md).

## Top-level structure

```yaml
version: 3

app:
  title: Schedule Viewer
  timezone: Europe/Madrid

defaults:
  week_starts_on: monday
  image_fit: contain

calendar: ...
views: ...
desktop: ...
academic_years: ...
rules: ...
```

## Image descriptors

An image can come from the published app or from the user's device.

### Published/static image

```yaml
image:
  src: assets/inactive/christmas.webp
  alt: Christmas
  fit: contain
```

### Device-local image

```yaml
image:
  asset: christmas
  alt: Christmas
  fit: contain
```

`asset` is a stable logical ID whose Blob is stored in IndexedDB. At render time Schedule Viewer resolves it through an object URL and renders it with the same `<img>` pipeline as a normal `src` image.

An image descriptor must define **exactly one** of:

```text
src
asset
```

Using both, or neither, is a validation error.

Supported browser image formats include GIF, PNG, JPEG, WebP, SVG and AVIF. Local GIFs remain Blobs, so animation is preserved rather than being flattened during import.

## Calendar

### Recurring inactive weekdays

Simple form:

```yaml
inactive_weekdays:
  - saturday
  - sunday
```

Only Sunday:

```yaml
inactive_weekdays:
  - sunday
```

No recurring inactive weekdays:

```yaml
inactive_weekdays: []
```

Extended form with a per-weekday image:

```yaml
inactive_weekdays:
  sunday:
    image:
      asset: sunday-image
      alt: Sunday
      fit: contain
```

The same field may use `src` instead when the image is part of the published application.

### Mandatory fallback image

Every configuration must include:

```yaml
calendar:
  inactive:
    default_image:
      asset: inactive-default
      alt: No activities today
      fit: contain
```

A repository/demo configuration will normally use `src` here because its fallback asset ships with the site. A personal local configuration may use `asset`.

The compiler rejects a configuration without a valid default image.

### Exact dates

```yaml
active_dates:
  - date: 2026-11-14
    label: Extraordinary session

inactive_dates:
  - date: 2026-11-13
    label: Special non-teaching day
    image:
      asset: special-day
```

An explicit active date overrides the normal inactive rules.

### Holidays and periods

Academic-year calendars can declare:

```yaml
holidays:
  - date: 2026-12-25
    label: Christmas
    image:
      asset: christmas

periods:
  - id: winter
    type: vacation
    start: 2026-12-23
    end: 2027-01-07
    label: Winter break
    image:
      asset: winter-break
```

Image precedence for an inactive date is:

```text
exact date
> holiday
> highest-priority matching period
> inactive weekday
> calendar.inactive.default_image
```

Overlapping periods with equal priority and different images are rejected as ambiguous.

## View profiles

A view combines matching conditions, a time range and a renderer:

```yaml
views:
  touch_portrait:
    priority: 200
    when:
      orientation: portrait
      pointer: coarse
    range: day
    renderer:
      type: timetable
      artwork: phone
```

Supported conditions:

```text
orientation: portrait | landscape | any
min_width
max_width
min_height
max_height
pointer: fine | coarse | any
```

`manual_only: true` creates a view that is only selected explicitly, for example the secondary desktop view.

The Settings UI deliberately hides these internal profile names. On touch devices it exposes **Vertical** and **Horizontal**. On desktop it exposes **Primary** and **Secondary**.

## Time ranges

### Day

```yaml
range: day
```

### Week

```yaml
range:
  type: week
  starts_on: monday
```

### Month

```yaml
range: month
```

### Year

```yaml
range: year
```

### Relative window

```yaml
range:
  type: relative
  before: 2
  after: 4
```

### Rolling window

```yaml
range:
  type: rolling
  days: 14
  anchor_position: center
```

`anchor_position` can be `start`, `center` or `end`.

### Absolute interval

```yaml
range:
  type: interval
  start: 2026-09-01
  end: 2026-09-30
```

Every range becomes a normalized runtime object with:

```text
type
anchor
start
end
dayCount
```

## Desktop toggling

```yaml
desktop:
  when:
    min_width: 1000
    pointer: fine

  primary_view: wide_default
  secondary_view: desktop_portrait
  default_view: wide_default

  shortcuts:
    toggle_view:
      key: Space
      enabled: true
```

The default public demo uses the primary horizontal/weekly view.

`Space` alternates primary and secondary views while the page remains open. Settings can disable the shortcut.

It is intentionally ignored when:

- focus is in `input`, `textarea` or `select`;
- focus is in `contenteditable`;
- focus is on a button/link/interactive ARIA control;
- Settings is open;
- Ctrl, Alt, Meta or Shift is held;
- the keydown is an auto-repeat.

`Ctrl+,` on Windows/Linux and `Cmd+,` on macOS opens Settings.

## Rules

Rules let calendar state and presentation remain separate.

```yaml
rules:
  - priority: 300
    when:
      calendar_status: vacation
      view:
        - touch_landscape
        - wide_default
    content:
      type: image
      asset: vacation-image
      alt: Vacation
```

A rule image may use `src` instead when it ships with the application.

Supported conditions:

```text
view
calendar_status
weekday
term
date
date_range
```

Supported rule content:

```text
image
inactive-image
current-term-schedule
next-term-schedule
term-schedule
```

Higher `priority` wins. Declaration order is only the final tie-breaker.

## Generated schedule artwork

Demo/source-controlled configurations may declare prerendered weekly/daily WebP paths under `term.assets`.

Phone timetable views use runtime SVG artwork to fit the viewport precisely. Wide/desktop day and week views prefer the declared WebP when available and fall back to generated SVG.

A local configuration does not need repository assets. The v3-to-local migration can preserve existing cached WebPs as IndexedDB assets and rewrite the corresponding term content to local `asset` descriptors.

Other range types use a generic generated range summary until a more specialized renderer is configured.

## Visual Settings and YAML stay in sync

The visual UI and advanced editor modify the same normalized v3 model. Schedule Viewer does not maintain a separate "GUI config" and "YAML config".

Conceptually:

```text
visual Settings ─┐
                 ├→ normalized v3 model → validation → IndexedDB
advanced YAML ───┘
```

When exporting YAML, the current normalized model is decompiled into the human-friendly v3 representation.

## Local persistence and backups

Personal configuration is stored locally in IndexedDB. Device images are stored as Blobs in a separate asset store.

The normal backup format is one `.schedule` archive containing:

```text
schedule.yaml
manifest.json
assets/
```

Import validates the manifest, YAML and required assets before replacing the active state. The replacement is transactional from the user's point of view: a failed import leaves the previous configuration intact.

For the storage model, package limits and migration details, see [`local-config.md`](local-config.md).

## Advanced YAML editor

**Settings → Advanced → Edit YAML** dynamically loads CodeMirror 6, Lezer YAML and Schedule Viewer's browser-side schema compiler.

The editor provides:

- YAML syntax highlighting;
- structured indentation;
- syntax diagnostics;
- semantic Schedule Viewer diagnostics;
- Apply only when validation succeeds.

The heavy editor bundle is intentionally absent from normal startup.

## Offline

The Service Worker owns the published application shell, compiled demo JSON and demo/static assets. IndexedDB owns personal configuration and local Blobs.

```text
Cache Storage → public app/runtime/demo
IndexedDB     → user config + local image assets
```

The lighter config/import-export bundle is available offline. The CodeMirror editor remains genuinely on-demand.

A legacy `schedule-viewer-offline-v3*` cache is preserved until the new runtime has migrated its personal configuration and cached artwork to IndexedDB. Only after successful persistence is the old cache removed.

Remote images and `data:` / `blob:` URLs are not precached as static application assets.
