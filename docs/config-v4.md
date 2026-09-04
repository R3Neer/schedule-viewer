# Configuration v4

Schedule Viewer v4 is an image-only, general-purpose period model. The YAML source and runtime JSON represent the same normalized contract.

## Top level

```yaml
version: 4
app:
  timezone: Europe/Madrid
defaults:
  week_starts_on: monday
  image_fit: contain
presentation:
  vertical:
    unit: day # day | week | month
  desktop_toggle: true
calendar:
  active_weekdays: [monday, tuesday, wednesday, thursday, friday]
  exceptions: []
  inactive_periods: []
periods: []
```

`periods` must contain at least one non-overlapping interval. Dates use ISO `YYYY-MM-DD` and both ends are inclusive.

## Periods and images

```yaml
periods:
  - id: autumn
    name: Autumn programme
    start: '2026-09-01'
    end: '2026-12-18'
    images:
      active:
        vertical:
          default: assets/autumn/default.webp
          days:
            monday: assets/autumn/monday.webp
        horizontal: assets/autumn/horizontal.webp
      inactive:
        vertical: assets/states/inactive-vertical.webp
        horizontal: assets/states/inactive-horizontal.webp
```

An image may be a static `src` string/object or a local `asset` descriptor. Allowed MIME formats are PNG, JPEG, WebP, AVIF and GIF. User SVG is rejected in YAML, file selection and backup restore.

The active horizontal image is deliberately unique per period. Vertical overrides are generated from `presentation.vertical.unit`:

- `day`: weekdays that have at least one effective active date in the period;
- `week`: every real week intersecting the period, including partial first and last weeks;
- `month`: every distinct `YYYY-MM` occurrence intersecting the period.

Unconfigured vertical targets fall back to `active.vertical.default`.

## Calendar

```yaml
calendar:
  active_weekdays: [monday, tuesday, wednesday, thursday, friday]
  exceptions:
    - id: special-opening
      date: '2026-10-17'
      name: Special opening
      state: active
      kind: other # holiday | closure | other
  inactive_periods:
    - id: winter-break
      name: Winter break
      start: '2026-12-19'
      end: '2027-01-10'
      kind: vacation # vacation | closure | other
```

For a date inside a configured period, precedence is: exact active exception, exact inactive exception, matching inactive interval, weekly pattern and finally outside-period state.

Exact exception dates are unique. Inactive intervals may not have an end before their start.

## Local assets

A local image is represented without embedding bytes in YAML:

```yaml
asset: image-2c9100
alt: A custom image
fit: cover
```

The `asset` identifier resolves to the original Blob in IndexedDB. YAML export therefore excludes local bytes; `.schedule` export includes them.

## Compatibility

The editor and normal import accept only v4. Runtime migration accepts a v3 configuration only when every used term has valid daily and weekly image assets and none is SVG. Terms become independent periods; calendar exceptions and inactive intervals are retained; structured subjects, sessions, title and brand metadata are discarded.

If that safe mapping is impossible, the original record remains isolated and downloadable instead of being overwritten.
