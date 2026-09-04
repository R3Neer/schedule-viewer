# Changelog

All notable changes to Schedule Viewer are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-04

### Added

- Local-first period and calendar configuration with weekly patterns, exact exceptions and named inactive intervals.
- Portrait image selection by weekday, real week or calendar month, plus one fixed landscape image per period.
- Original-byte storage for PNG, JPEG, WebP, AVIF and animated GIF images.
- Validated YAML v4 import/export and complete `.schedule` backups.
- Installable offline PWA behavior with safe automatic updates.
- Grouped settings, touch navigation gestures, Reduce Motion support and Apple-specific Liquid Glass on floating controls.
- Collapsible active/inactive image groups with live thumbnails and stable state while replacing images.
- Deterministic public demo artwork and a reproducible visual-review matrix.

### Platform experience

- Touch-first iOS layout on iPhone, iPad and Android, with Apple materials on iOS/iPadOS and generic materials on Android.
- Desktop layout on macOS, Windows and Linux, with Apple materials on macOS and generic materials elsewhere.
- Automatic portrait/landscape switching on touch devices and an optional Space-key view toggle on desktop.
- Installable PWA shell, offline startup and release-isolated automatic updates that preserve local configuration and images.

### Privacy and accessibility

- No account, backend, telemetry or analytics; configuration and images remain on the device.
- Keyboard navigation, visible focus, 44 px touch targets, screen-reader labels and high-contrast YAML syntax colours.
- Interruptible settings motion, safe Back/dismiss gestures and support for Reduce Motion.

### Compatibility

- Compatible image-backed v3 configurations migrate automatically.
- Incompatible structured-timetable and SVG-backed legacy data is isolated for recovery.

[1.0.0]: https://github.com/R3Neer/schedule-viewer/releases/tag/v1.0.0
