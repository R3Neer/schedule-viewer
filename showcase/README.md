# README showcase fixture

This directory contains the two public-domain, non-AI images used to build the
repository screenshots. They are deliberately kept outside `assets/`, so they
never become part of the public demo, the offline cache or the Pages artifact.

Run the deterministic capture pipeline after building the app:

```powershell
$env:SCHEDULE_VIEWER_CHROMIUM = "C:\path\to\chrome.exe" # optional
node tools/capture_readme.mjs
python tools/compose_readme_media.py
```

The capture script imports the images into a fresh browser profile through the
same IndexedDB model used by the application. It does not alter the committed
demo configuration.

## Sources and rights

### `botanical-print.jpg`

- Work: *Botanical book illustration (or possibly at one time an envelope) with text and flowers*
- Date: 1880
- Source institution: Library of Congress
- Commons file page: <https://commons.wikimedia.org/wiki/File:Botanical_book_illustration_(or_possibly_at_one_time_an_envelope)_with_text_and_flowers_LCCN2009631629.jpg>
- Rights: public domain; published before 1931 and identified by Commons as free of known copyright restrictions
- Downloaded: 2026-09-04, 1280 × 1770 JPEG rendition
- SHA-256: `4eeb321088cd280d3cff7b9fd716d1f577d3fad47d275cba5d5b9a6970419643`

### `mountain-landscape.jpg`

- Work: *Summer landscape in mountains*
- Author: U.S. Fish and Wildlife Service
- Commons file page: <https://commons.wikimedia.org/wiki/File:Summer_landscape_in_mountains.jpg>
- Rights: public domain as a work of the U.S. Fish and Wildlife Service
- Downloaded: 2026-09-04, 1920 × 1249 JPEG rendition
- SHA-256: `ae944d90ec8d8c5ab23999b0a70536d9f5913628c3347fd942b59cf4ee2f4ba0`

The screenshots and hero image are project documentation and are distributed
under the repository's MIT license. The two source works retain the public-domain
status documented above.
