Frozen entry point, settings UI, document and worker from commit 4e7b238
(deployed release 20260903-v4-6). Do not modernize these fixtures.

The upgrade regression serves these files on the first visit and caches them
with the real old worker. Unchanged shared runtime modules and compiled demo
assets come from dist. This specifically exercises an old application without
app-updates.js, not just an old worker controlling a modern application.
