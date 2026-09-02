# Especificación — Schedule Viewer v3

Schedule Viewer is a declarative temporal-content viewer.

The source configuration is YAML. Runtime JSON is compiled during build.

Core responsibilities are deliberately separated:

```text
view selection
→ range resolution
→ calendar evaluation
→ rule selection
→ content resolution
→ rendering
```

The runtime must not encode assumptions such as "weekend means Saturday/Sunday" or "landscape means week".

See [`config-v3.md`](config-v3.md) for the normative configuration reference and [`qa.md`](qa.md) for acceptance coverage.
