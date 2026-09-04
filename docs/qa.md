# Quality assurance

GitHub Pages receives the exact `dist/` artifact only after the full v4 barrier succeeds.

## Contracts

- Python validates and round-trips the public v4 YAML, non-overlapping periods, real partial weeks and cross-year months.
- Node covers calendar precedence, vertical targets, the fixed horizontal selection, exact image bytes, persistence, backup, safe v3 migration and SVG rejection.
- The public-tree audit scans tracked text for inherited private schedule identifiers.
- The production build verifies all referenced assets and release-isolated module copies.
- Generated demo WebPs must pass dimensions, variety and contrast checks.

## Browsers

Chromium exercises all six sections, period/calendar CRUD, all vertical units, fixed horizontal images, keyboard/focus behavior, pending-work confirmation, touch gestures, orientation changes, offline launch and safe updates.

The required geometries are 320 × 740, 402 × 874, 874 × 402, tablet and 1440 × 900. Hidden panels may not be interactive or rendered. Motion tests explicitly reverse opening/navigation, restore panel scroll and focus, and protect safe gesture margins.

A separate WebKit workflow mounts the real optical Apple control. This is a technical approximation, not a claim of physical-iPhone validation.

## Visual barrier

`npm run capture:readme` creates both the committed public screenshots and `docs/visual-review-v4/`, a matrix containing every section in Apple light and dark plus narrow, landscape, desktop and Reduce Motion representatives.

Review is performed at normal and reduced speed against the supplied Apple Music reference, Apple Settings and the current HIG. Acceptance requires:

- identical information order and navigation across environments;
- stable header, sheet size, scroll and final focus;
- no flashes, clipped rows, ambiguous controls or hidden focus targets;
- no partial pause on Back or Close;
- no excessive bounce or delayed touch feedback;
- opaque/grouped content surfaces with Liquid Glass limited to floating controls;
- no renderer remount on every animation frame.

The loop is implement → capture → compare → adjust. Automated checks do not replace this inspection. Final behavior on an actual iPhone remains a user validation after Pages deploy.
