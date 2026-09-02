import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const listeners = new Map();
const deletedCaches = [];
let claimed = false;

const context = {
  URL,
  console,
  caches: {
    async keys() {
      return [
        "ucm-scheduler-offline-v1",
        "schedule-viewer-old",
        "schedule-viewer-offline-v2-content",
        "another-app-cache"
      ];
    },
    async delete(name) {
      deletedCaches.push(name);
      return true;
    }
  },
  self: {
    registration: { scope: "https://example.test/schedule-viewer/" },
    location: { origin: "https://example.test" },
    clients: {
      async claim() { claimed = true; }
    },
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

let activation = null;
listeners.get("activate")({
  waitUntil(promise) { activation = promise; }
});
await activation;

assert.deepEqual(deletedCaches.sort(), [
  "schedule-viewer-old",
  "ucm-scheduler-offline-v1"
].sort());
assert.equal(claimed, true);

assert.equal(context.CACHE_NAME, undefined, "CACHE_NAME es léxico y no necesita exponerse");
assert.match(code, /schedule-viewer-/);
assert.match(code, /ucm-scheduler-/);
assert.match(code, /offline-v2-content/);
assert.match(code, /content-renderer\.js/);

console.log("service-worker: descubre assets y limpia cachés legacy de ucm-scheduler OK");
