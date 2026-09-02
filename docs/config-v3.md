# Schedule Viewer v3 configuration

The human-editable configuration lives in:

```text
config/schedule.yaml
```

Do not create or edit a JSON configuration under `config/`. JSON is a build artifact.

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

## Calendar

### Recurring inactive weekdays

Simple form:

```yaml
inactive_weekdays:
  - saturday
  - sunday
```

Extended form with per-weekday images:

```yaml
inactive_weekdays:
  sunday:
    image:
      src: assets/inactive/sunday.gif
      alt: Domingo
      fit: contain
```

### Mandatory fallback image

Every configuration must include:

```yaml
calendar:
  inactive:
    default_image:
      src: assets/inactive/default.webp
      alt: Día inactivo
      fit: contain
```

The compiler rejects a configuration without it.

### Exact dates

```yaml
active_dates:
  - date: 2026-11-14
    label: Jornada extraordinaria

inactive_dates:
  - date: 2026-11-13
    label: San Alberto Magno
    image:
      src: assets/inactive/san-alberto.webp
```

An explicit active date overrides the normal inactive rules.

### Holidays and periods

Academic-year calendars can declare:

```yaml
holidays:
  - date: 2026-12-25
    label: Navidad
    image:
      src: assets/inactive/christmas.gif

periods:
  - id: winter
    type: vacation
    start: 2026-12-23
    end: 2027-01-07
    label: Vacaciones de Navidad
    image:
      src: assets/inactive/winter.webp
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
  phone_portrait:
    priority: 100
    when:
      orientation: portrait
      max_width: 760
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

  primary_view: wide_default
  secondary_view: desktop_portrait
  default_view: wide_default

  shortcuts:
    toggle_view:
      key: Space
```

The default is the primary horizontal view.

`Space` alternates primary and secondary views while the page remains open.

It is intentionally ignored when:

- focus is in `input`, `textarea` or `select`;
- focus is in `contenteditable`;
- focus is on a button/link/interactive ARIA control;
- Ctrl, Alt, Meta or Shift is held;
- the keydown is an auto-repeat.

## Rules

Rules let calendar state and presentation remain separate.

```yaml
rules:
  - priority: 300
    when:
      calendar_status: vacation
      view:
        - phone_landscape
        - wide_default
    content:
      type: image
      src: assets/states/vacations-horizontal.webp
      alt: Vacaciones
```

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

## Generated schedule assets

The existing weekly/daily WebP assets are still generated from the academic-year data.

Phone timetable views use runtime SVG artwork to fit the viewport precisely.

Wide/desktop day and week views prefer the prerendered WebP and fall back to generated SVG.

Other range types use a generic generated range summary until a more specialized renderer is configured in a future version.

## Offline

The Service Worker precaches:

- runtime files;
- compiled `schedule.json`;
- generated day/week/state assets;
- every local image descriptor reachable from the compiled config.

Remote images and `data:` / `blob:` URLs are not precached.
