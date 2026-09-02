# QA — Schedule Viewer v3

Deployment is blocked unless the exact built `dist/` artifact passes validation and real-browser tests.

## Static validation

`tools/validate_config.py` parses `config/schedule.yaml` with `yaml.safe_load`, normalizes it and rejects invalid v3 configuration.

`tests/config-v3.test.py` includes positive and negative contracts for:

- required inactive fallback image;
- weekdays;
- day/week/month/year/relative/rolling/interval ranges;
- invalid dates;
- inverted intervals;
- invalid renderers;
- broken desktop view references;
- unknown rule views;
- invalid image descriptors;
- session overlaps;
- unknown subjects;
- ambiguous overlapping periods.

## JavaScript unit contracts

`tests/schedule-core.test.mjs` covers:

- leap-day date arithmetic;
- all supported range families;
- configurable week starts;
- view profile priority;
- manual views;
- desktop context and toggling;
- zero/one/two inactive recurring weekend days;
- active-date overrides;
- inactive image precedence;
- holidays, vacations and non-teaching days;
- current/next/explicit-term rules;
- monthly generated ranges;
- custom asset discovery.

Renderer and Service Worker behavior have separate contract suites.

## Browser E2E

Playwright opens `dist/` in Chromium.

The v3 suite verifies at least:

- phone portrait;
- phone landscape;
- orientation change without reload;
- Saturday active + Sunday inactive configuration;
- no recurring inactive weekdays;
- required inactive fallback image;
- per-holiday animated GIF override;
- exact-date image overriding a period image;
- vacation behavior and Q2 preview priority;
- desktop horizontal default;
- Space toggling without reload;
- keyboard accessibility exclusions;
- monthly range;
- arbitrary relative range;
- absolute interval;
- no unexpected viewport scroll;
- offline phone inactive image;
- offline desktop WebP and Space toggle.

A failed browser assertion blocks Pages upload and deployment.
