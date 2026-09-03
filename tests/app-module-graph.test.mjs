import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["app.js"],
  bundle: true,
  platform: "browser",
  format: "esm",
  external: ["./lazy/*"],
  write: false,
  logLevel: "silent"
});

assert.ok(result.outputFiles?.length, "el grafo estático de app.js debe poder resolverse y empaquetarse");
console.log("app-module-graph: imports/exportaciones del runtime estático resolubles OK");
