# v1.0.0 release checklist

The source is prepared for v1.0.0, but the version is not released until every item below is complete. Do not create the tag or GitHub Release early.

## Repository

- [x] MIT license, contributing guide, security policy, changelog and third-party notices exist.
- [x] Package metadata identifies version 1.0.0, repository, homepage and supported Node.js baseline.
- [x] Public README describes the period/calendar image model and uses reproducible current screenshots.
- [x] The default branch is `main` and no other remote branches remain.
- [ ] Make the repository public immediately before the release announcement.
- [ ] Enable GitHub private vulnerability reporting once repository visibility permits it.

## Product

- [ ] Re-run the complete unit, build, Chromium and WebKit barrier on the release commit.
- [ ] Confirm Pages serves the release commit and the expected release-isolated resources.
- [ ] Upgrade from the previous deployed Service Worker while preserving a real local configuration and image assets.
- [ ] Validate installation, portrait/landscape switching, image previews, offline launch and update on a physical iPhone.
- [ ] Validate desktop settings, keyboard navigation, YAML import/export and `.schedule` backup roundtrip.
- [ ] Confirm the public-tree audit contains no personal or institution-specific schedule data.
- [ ] Review every committed README screenshot and visual-review capture against the final artifact.

## Publish

1. Replace `Unreleased` in `CHANGELOG.md` with the release date in `YYYY-MM-DD` form.
2. Confirm `main` is clean, pushed and green in GitHub Actions.
3. Create the signed or annotated tag `v1.0.0` on that exact commit.
4. Push the tag and create the GitHub Release using the prepared changelog and generated release notes.
5. Verify the release and Pages URLs from a logged-out browser.

No release tag or GitHub Release is created by this preparation document.
