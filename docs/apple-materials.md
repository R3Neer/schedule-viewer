# Apple-style grouped settings

Settings opens a home sheet with grouped navigation to Schedule, Images, Backup,
and Advanced. Back returns to the menu without discarding the current draft.
Name, brand, view settings and inactive weekdays use rows inside opaque groups.
The save action appears only while the regular configuration has pending changes.

The supplied Apple Music account sheet is the visual reference: neutral lavender
background, white groups, restrained text weights and a simple floating close
control. Dark mode uses the same hierarchy in neutral charcoal tones.

## Materials

The sheet and its content do not project the schedule image. The close control
uses CSS backdrop filtering against its actual background. Optical Liquid Glass
is limited to the floating settings button over the timetable; its renderer is
disposed while hidden or while Settings is open, and respects reduced transparency.
A failed optional bundle leaves the base control and full settings appearance usable.

Critical settings CSS is linked directly from HTML. It must never be bundled only
with an optional renderer. This is a browser approximation of the reference, not
Apple's native material implementation.

References: [Materials](https://developer.apple.com/design/human-interface-guidelines/materials),
[Color](https://developer.apple.com/design/human-interface-guidelines/color),
[Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

## Deployment and updates

GitHub Pages must use **GitHub Actions** as its build source. Publishing the root
of main omits the generated config and lazy bundles. The workflow builds and tests
dist, deploys that artifact, then checks the public URLs for the expected resources
and release marker.

Each release has a distinct Service Worker cache. Activation removes old application
caches but preserves the v3 migration cache and leaves IndexedDB untouched. This also
invalidates previously downloaded lazy modules, whose URLs are otherwise stable.
Bump RELEASE_ID, the HTML asset version and the deployment release assertion together.

`app-updates.js` checks at registration, foreground/page restoration and reconnect,
with a 10-second minimum spacing for event checks and a five-minute visible-page
poll. Offline/hidden clients do not poll the network. Installation precaches the
next version but no longer calls skipWaiting unconditionally. The waiting worker
asks every in-scope window to prepare before activating. A client with Settings
open (including YAML or a file picker), or an unfinished operation, refuses.
An unresponsive/old client also refuses by timeout: it must be closed or reopened.
Prepared clients briefly become inert to prevent a new edit during activation;
refusal unlocks them, with a failsafe timeout if the worker disappears.

The pending notice asks users to save and close Settings in all tabs. Closing with
unsaved form/YAML changes requires explicit discard confirmation. After every
client is safe, controllerchange reloads each once; initial installation does not
reload. The pre-update cache is retained until activation; IndexedDB is untouched.
Older installed versions need to receive this release once before they can use
the new foreground checks and coordination protocol.

Browser coverage includes grouped navigation and draft preservation, appearance
without the optical bundle, light/dark YAML contrast, portrait/landscape layouts,
and the previous real Service Worker updating to the new release. The update test
checks both exact local image bytes and configuration, and rejects a deliberately
stale YAML bundle seeded in the old cache. The Apple suite also runs under WebKit.
