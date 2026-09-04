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

## `.schedule` packages

The portable package is a ZIP with:

```text
schedule.yaml
manifest.json
assets/
```

The manifest uses configuration version 4 and records each original filename, MIME type and asset identifier. Import verifies the schema, references, archive paths, supported MIME types and configured size limits before atomically replacing the active state.

YAML import/export intentionally carries configuration only. The settings UI says so next to the compact YAML actions.

## Lazy advanced tools

CodeMirror, the YAML parser and ZIP implementation are not part of initial rendering. They load only when the related editor/import/export action is opened. The lightweight offline bundle remains cached so settings and backup work without a network connection.

## Safe v3 migration

Migration runs only for image-backed v3 terms. Each term becomes a named period, daily images become vertical day overrides, the weekly image becomes its fixed horizontal image, and compatible calendar dates/intervals are retained.

If a used term lacks a required image, depends on structured schedule content or references SVG, migration stops. The old record is isolated, remains downloadable, and the UI offers v4 import or reset; it is never silently overwritten.
