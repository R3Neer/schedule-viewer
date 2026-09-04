# Local configuration and assets

Schedule Viewer separates the published application from personal state.

## Storage

```text
Cache Storage
→ public runtime, neutral v4 demo and generated demo images

IndexedDB: schedule-viewer-local
├── config / active
├── config / incompatible-v3 (only when safe migration is impossible)
└── assets / original local image Blobs
```

The active IndexedDB configuration wins over the compiled demo. Updates replace the application shell, not personal records.

## Image descriptors

Static source:

```yaml
src: assets/example.webp
alt: Example
fit: contain
```

Device-local source:

```yaml
asset: image-2c9100
alt: Example
fit: cover
```

A descriptor defines exactly one of `src` or `asset`. Local identifiers resolve to IndexedDB Blobs and temporary object URLs, which are revoked after use. PNG, JPEG, WebP, AVIF and GIF bytes are never recoded; SVG is rejected.

For the complete YAML contract, including periods, calendar rules and image assignment, see [Configuration v4](config-v4.md).

## `.schedule` packages

A `.schedule` file is a ZIP archive with the media type `application/vnd.schedule-viewer+zip`. The extension is `.schedule`; there is no wrapper directory inside the archive.

A canonical package exported by Schedule Viewer has this shape:

```text
schedule.yaml
manifest.json
assets/
├── <asset-id>.<ext>
└── ...
```

Only images referenced through YAML `asset:` descriptors are embedded in the package. Images referenced through `src:` remain external/static references and are not copied into the archive. A portable backup should therefore use `asset:` for every image that must travel with the configuration.

### `schedule.yaml`

`schedule.yaml` must be a valid configuration v4 document as defined in [Configuration v4](config-v4.md). Every distinct local asset identifier referenced by the normalized configuration must have a matching entry in `manifest.json` and a corresponding file in the archive.

Minimal example:

```yaml
version: 4
app:
  timezone: Europe/Madrid
defaults:
  week_starts_on: monday
  image_fit: contain
presentation:
  vertical:
    unit: day
  desktop_toggle: true
calendar:
  active_weekdays: [monday, tuesday, wednesday, thursday, friday]
  exceptions: []
  inactive_periods: []
periods:
  - id: autumn
    name: Autumn
    start: '2026-09-01'
    end: '2026-12-18'
    images:
      active:
        vertical:
          default:
            asset: autumn-vertical
        horizontal:
          asset: autumn-horizontal
      inactive:
        vertical:
          asset: inactive-vertical
        horizontal:
          asset: inactive-horizontal
```

### `manifest.json`

The canonical manifest has this structure:

```json
{
  "format": "schedule-viewer",
  "formatVersion": 1,
  "configVersion": 4,
  "createdAt": "2026-09-04T17:00:00.000Z",
  "assets": [
    {
      "id": "autumn-vertical",
      "file": "assets/autumn-vertical.webp",
      "mimeType": "image/webp",
      "filename": "autumn-vertical.webp"
    }
  ]
}
```

Package compatibility is identified by these values:

- `format` must be `schedule-viewer`.
- `formatVersion` must be `1`.
- `configVersion` must be `4`.
- `createdAt` is written by the official exporter with `new Date().toISOString()`.
- `assets` lists the embedded local images. Canonical exports include only assets referenced by the configuration.

Each asset entry contains:

- `id`: the exact identifier used by one or more YAML `asset:` descriptors;
- `file`: the relative archive path containing the original image bytes;
- `mimeType`: one of `image/png`, `image/jpeg`, `image/webp`, `image/avif` or `image/gif`;
- `filename`: the original user-facing filename preserved for restore.

The importer requires `id` and `file` to be strings. The official exporter also always writes `mimeType` and `filename`; external generators should do the same. Asset identifiers must be unique inside the manifest.

### Canonical asset filenames

The official exporter stores each required local asset at:

```text
assets/<safe-id><extension>
```

`<safe-id>` is produced from the asset identifier by:

1. converting it to text;
2. applying Unicode `NFKD` normalization;
3. replacing each run of characters outside `A-Z`, `a-z`, `0-9`, `.`, `_` and `-` with `-`;
4. removing leading and trailing `-` characters;
5. using `asset` if the result is empty.

The exporter takes the extension from the original filename when it ends in a 1–8 character alphanumeric extension. Otherwise it derives the extension from the MIME type:

| MIME type | Extension |
| --- | --- |
| `image/gif` | `.gif` |
| `image/png` | `.png` |
| `image/jpeg` | `.jpg` |
| `image/webp` | `.webp` |
| `image/avif` | `.avif` |

The exporter falls back to `.bin` only when no known extension can be derived; a valid user asset still has to pass the supported-image checks.

An external generator does not have to reproduce these filenames exactly: `manifest.json.file` is authoritative. It does, however, have to use safe relative archive paths.

### Archive path rules

Every path inspected during import must be relative and safe:

- it must not be empty;
- it must not start with `/`;
- it must not contain `\\`;
- none of its `/`-separated path components may be `..`.

`manifest.json` and `schedule.yaml` must exist at the archive root.

### Size and image limits

The current package limits are:

- complete `.schedule` archive: at most 100 MiB;
- each embedded asset: at most 25 MiB;
- supported embedded image types: PNG, JPEG, WebP, AVIF and GIF;
- SVG is rejected.

Image bytes are stored and restored without recoding.

### How to generate a `.schedule` outside the app

To build a package programmatically or from another tool:

1. Create a valid v4 `schedule.yaml`.
2. Use `asset: <id>` for every image that must be embedded in the portable package.
3. Collect the distinct asset IDs referenced by the configuration.
4. For each ID, place the original image bytes at a safe relative path, conventionally `assets/<safe-id>.<ext>`.
5. Create one `manifest.json.assets` entry for each referenced ID, preserving its MIME type and original filename.
6. Write `format: "schedule-viewer"`, `formatVersion: 1`, `configVersion: 4` and an ISO `createdAt` timestamp in the manifest.
7. Create a ZIP whose root contains `schedule.yaml`, `manifest.json` and the referenced image files. Do not wrap them in an extra top-level folder.
8. Save or rename the resulting ZIP with the `.schedule` extension.
9. Keep the final archive and every individual asset within the size limits above.

For a canonical package equivalent to the application exporter, use DEFLATE compression at level 6 and the asset naming rules described above. ZIP compression details are not part of the logical package identity; the manifest paths and validated contents are.

A generator should reject the package before writing it when:

- the YAML is not valid configuration v4;
- a referenced `asset:` ID has no manifest entry;
- a manifest entry points to a missing archive file;
- the same asset ID appears more than once;
- an archive path is unsafe;
- an embedded image has an unsupported MIME type or exceeds 25 MiB;
- the final archive exceeds 100 MiB.

The implementation used by the application lives in [`lazy-src/config-io.entry.js`](../lazy-src/config-io.entry.js). `exportSchedulePackage()` is the reference exporter and `inspectSchedulePackage()` is the reference importer/validator.

YAML import/export intentionally carries configuration only. The settings UI says so next to the compact YAML actions.

## Lazy advanced tools

CodeMirror, the YAML parser and ZIP implementation are not part of initial rendering. They load only when the related editor/import/export action is opened. The lightweight offline bundle remains cached so settings and backup work without a network connection.

## Safe v3 migration

Migration runs only for image-backed v3 terms. Each term becomes a named period, daily images become vertical day overrides, the weekly image becomes its fixed horizontal image, and compatible calendar dates/intervals are retained.

If a used term lacks a required image, depends on structured schedule content or references SVG, migration stops. The old record is isolated, remains downloadable, and the UI offers v4 import or reset; it is never silently overwritten.
