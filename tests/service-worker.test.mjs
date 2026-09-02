import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const listeners = new Map();
const context = {
  URL,
  console,
  self: {
    registration: { scope: "https://example.test/schedule-viewer/" },
    location: { origin: "https://example.test" },
    addEventListener(name, callback) { listeners.set(name, callback); }
  }
};
vm.createContext(context);
vm.runInContext(code, context, { filename: "service-worker.js" });

assert.ok(listeners.has("install"));
assert.ok(listeners.has("activate"));
assert.ok(listeners.has("fetch"));

const config = {
  states: {
    noClassTodayVertical: "assets/states/no-class.webp",
    vacationsHorizontal: "assets/states/vacations.webp"
  },
  content: {
    states: {
      noClassToday: { type: "image", src: "assets/custom/no-class.gif" },
      vacations: { type: "image", src: "data:image/png;base64,AAAA" }
    }
  },
  academicYears: [{
    terms: [{
      assets: {
        week: "assets/q1/week.webp",
        days: { monday: "assets/q1/monday.webp" }
      },
      content: {
        week: { type: "image", src: "assets/custom/week.avif" },
        days: {
          monday: "assets/custom/monday.gif",
          tuesday: { type: "image", src: "https://cdn.example.org/remote.png" },
          wednesday: { type: "generated-schedule" }
        }
      }
    }]
  }]
};

const paths = [...context.scheduleAssetPaths(config)].sort();
assert.deepEqual(paths, [
  "https://example.test/schedule-viewer/assets/custom/monday.gif",
  "https://example.test/schedule-viewer/assets/custom/no-class.gif",
  "https://example.test/schedule-viewer/assets/custom/week.avif",
  "https://example.test/schedule-viewer/assets/q1/monday.webp",
  "https://example.test/schedule-viewer/assets/q1/week.webp",
  "https://example.test/schedule-viewer/assets/states/no-class.webp",
  "https://example.test/schedule-viewer/assets/states/vacations.webp"
]);

assert.equal(context.CACHE_NAME, undefined, "CACHE_NAME es léxico y no necesita exponerse");
assert.match(code, /schedule-viewer-/);
assert.match(code, /offline-v2-content/);
assert.match(code, /content-renderer\.js/);

console.log("service-worker: descubre assets generated + image y filtra data/remotos OK");
