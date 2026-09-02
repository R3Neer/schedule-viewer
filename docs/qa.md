# QA — Schedule Viewer

## Automated validation

The deployment workflow validates the real production path before GitHub Pages receives anything.

Current CI stages:

1. validate `config/schedules.json`;
2. verify valid and invalid configurable-content contracts;
3. run schedule-selection, renderer and Service Worker unit tests;
4. build `dist/` and all generated WebP assets;
5. install Chromium;
6. open the built web app with Playwright;
7. deploy only if every previous step is green.

## Schedule-selection coverage

The unit suite covers, among other cases:

- dates before the first term;
- active weekdays;
- weekends;
- ordinary holidays;
- university non-teaching days;
- the inter-term vacation period;
- preview of the next term from the configured promotion date;
- the second term;
- Easter vacation;
- summer vacation;
- custom image overrides for day, week and state content;
- automatic discovery of local custom assets for offline caching.

## Browser E2E coverage

Playwright opens the exact `dist/` artifact that will later be deployed and verifies:

- iPhone portrait renders the expected daily timetable;
- a holiday renders `Sin clases hoy`;
- iPhone landscape renders vacations and the next-term transition correctly;
- rotating portrait → landscape → portrait changes the view without reloading;
- neither phone orientation introduces unwanted viewport scrolling;
- a custom animated GIF renders as `image` content;
- a custom PNG renders as weekly `image` content;
- the mobile app reloads successfully after the network is cut;
- desktop reloads offline and still receives the cached weekly WebP.

Each rendered image must be visible, complete and have the expected natural dimensions. The error box must remain hidden.

## Runtime invariants

- The DOM keeps a single visible schedule/content `<img>`.
- Calendar selection is separated from visual rendering.
- `generated-schedule` content can render dynamically as SVG.
- `image` content is passed directly to the browser, so supported image formats preserve native behaviour, including animation.
- The Service Worker caches local content by URL rather than by image extension.

## Current configured instance

The production configuration in this repository is still Samuel's 2026–2027 UCM Computer Science timetable. UCM-specific dates, subjects, rooms and source URLs belong to `config/schedules.json`; the runtime itself is intended to remain university-agnostic.
