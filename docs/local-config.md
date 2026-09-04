# Local configuration and assets

Schedule Viewer separates the published application from each user's personal state.

## Storage model

```text
Cache Storage
→ public runtime, neutral demo and demo assets

IndexedDB: schedule-viewer-local
├── config
│   └── active
└── assets
    └── local image Blobs
```

The app loads the `active` IndexedDB configuration when it exists. Otherwise it uses the compiled public demo.

## Image descriptors

Static/public image:

```yaml
image:
  src: assets/example.webp
  alt: Example
  fit: contain
```

Device-local image:

```yaml
image:
  asset: christmas
  alt: Christmas
  fit: contain
```

An `image` descriptor must define **exactly one** of `src` or `asset`.

`asset` is a logical ID. At render time:

```text
asset id
→ IndexedDB record
→ Blob
→ URL.createObjectURL()
→ <img>
```

Object URLs are revoked when they are no longer needed.

## Settings UX

The same v3 model is edited by both the visual Settings UI and the advanced YAML editor.

Touch devices show view controls as:

```text
Vertical
Horizontal
```

Desktop shows:

```text
Primary
Secondary
Space to toggle
```

This is presentation only; the underlying model remains the normal v3 view-profile model.

## `.schedule` packages

The normal backup format is one `.schedule` file, internally a ZIP:

```text
schedule.yaml
manifest.json
assets/
```

The manifest currently uses format version 1 and config version 3.

Import is validated before state replacement. Required referenced assets must be present and archive paths are checked against traversal/zip-slip patterns.

Current safety limits:

- 25 MiB per asset;
- 100 MiB per complete package.

## YAML editor

The browser's advanced editor uses CodeMirror 6, Lezer YAML and Schedule Viewer's browser-side schema compiler.

The editor bundle is not part of normal startup and is imported only after opening:

```text
Settings → Advanced → Edit YAML
```

The lighter config/import-export bundle is precached so visual Settings and backup remain available offline.

## Offline

Once installed and configured, the following must work without network access:

- schedule rendering;
- orientation/view changes;
- desktop Space toggle;
- local image rendering;
- Settings;
- visual edits;
- backup/import tools that only require local files.

User Blobs remain in IndexedDB rather than being duplicated in Cache Storage.

## v3 migration

A legacy `schedule-viewer-offline-v3*` cache is intentionally preserved during the first v4 Service Worker activation.

The new runtime then:

1. reads the cached v3 `schedule.json`;
2. copies referenced custom/static images to IndexedDB Blobs;
3. copies cached weekly/daily timetable WebPs to IndexedDB and rewrites term content to local `asset` descriptors;
4. atomically saves configuration + assets;
5. only then deletes the legacy v3 cache.

This ordering is deliberate. Deleting the old cache during Service Worker activation would destroy the only copy of the previous personal configuration before the new runtime could migrate it.
