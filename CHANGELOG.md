# Changelog

All notable changes to Schedule Viewer are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-09-05

### Fixed

- In an installed mobile PWA, the floating Settings button now stays 14px from the screen edge in both orientations. Regular Safari still respects its right safe-area inset.
- Images configured as `cover` automatically switch to `contain` on any device when filling the viewport would crop more than 10% of the image.

## [1.0.1] - 2026-09-05

### Fixed

- Installed iOS apps explicitly request a translucent status bar so portrait artwork can extend behind system chrome.
- Configurations saved by the defective image-fit importer are repaired from their synchronized YAML on the next launch, without replacing local image bytes or requiring another import.
- Touch artwork uses the complete viewport without padding or safe-area gutters; floating controls retain their safe-area positioning.
- `cover` fills the viewport on desktop too. `contain` remains available for uncropped images.
- Every image assignment inherits `defaults.image_fit` in both the browser importer and Python compiler. Explicit image fits survive YAML and `.schedule` round trips.
- Newly assigned images inherit the configured fit when no existing override is present.
- A new release cache identifier delivers the corrected CSS and importer to installed clients.
- Installed iOS PWAs use the full standalone viewport height, avoiding a safe-area-sized strip at the bottom when artwork extends behind the status bar.

### Validation

- Added Chromium and WebKit layout coverage for portrait, browser-height changes, landscape, narrow phones, tablets, desktop, light/dark themes, nonzero safe-area insets, package restore and offline reload.

### Updating existing schedules

Open the app once on this release to repair an earlier import that stored `contain` despite a global `cover` default. The repair only runs when the synchronized YAML proves that image fitting is the sole difference; re-import the original `.schedule` or YAML if the saved configuration also contains later edits. Site data does not need to be cleared.

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

[1.0.1]: https://github.com/R3Neer/schedule-viewer/releases/tag/v1.0.1
[1.0.2]: https://github.com/R3Neer/schedule-viewer/releases/tag/v1.0.2
