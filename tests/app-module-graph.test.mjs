import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["app.js", "apple-glass.js"],
  bundle: true,
  platform: "browser",
  format: "esm",
  external: ["./lazy/*"],
  outdir: "out",
  write: false,
  logLevel: "silent"
});

assert.ok(result.outputFiles?.length >= 2, "los grafos estáticos de app.js y apple-glass.js deben poder resolverse y empaquetarse");
console.log("app-module-graph: runtime principal + capa Apple resolubles OK");
