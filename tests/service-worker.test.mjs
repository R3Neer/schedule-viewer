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
        "schedule-viewer-offline-v2-content",
        "schedule-viewer-old",
        "schedule-viewer-offline-v3",
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
    clients: { async claim() { claimed = true; } },
    addEventListener(name, callback) { listeners.set(name, callback); }
  }
};

vm.createContext(context);
vm.runInContext(code, context, { filename: "service-worker.js" });

assert.ok(listeners.has("install"));
assert.ok(listeners.has("activate"));
assert.ok(listeners.has("fetch"));
assert.equal(typeof context.scheduleAssetPaths, "function");

const config = {
  states: {
    noClassTodayVertical: "assets/states/inactive.webp",
    vacationsHorizontal: "assets/states/vacations.webp"
  },
  calendar: {
    inactive: {
      defaultImage: { type: "image", src: "assets/inactive/default.webp" }
    },
    inactiveWeekdays: {
      sunday: { image: { type: "image", src: "assets/inactive/sunday.gif" } }
    }
  },
  academicYears: [{
    calendar: {
      holidays: [
        { date: "2026-12-25", image: { type: "image", src: "assets/inactive/christmas.svg" } }
      ],
      periods: [
        { id: "winter", image: { type: "image", src: "data:image/png;base64,AAAA" } }
      ]
    },
    terms: [{
      assets: {
        week: "assets/q1/week.webp",
        days: { monday: "assets/q1/monday.webp" }
      },
      content: {
        days: {
          monday: { type: "image", src: "https://cdn.example.org/remote.png" }
        }
      }
    }]
  }],
  rules: [
    { content: { type: "image", src: "assets/custom/rule.avif" } }
  ]
};

const paths = [...context.scheduleAssetPaths(config)].sort();
assert.deepEqual(paths, [
  "https://example.test/schedule-viewer/assets/custom/rule.avif",
  "https://example.test/schedule-viewer/assets/inactive/christmas.svg",
  "https://example.test/schedule-viewer/assets/inactive/default.webp",
  "https://example.test/schedule-viewer/assets/inactive/sunday.gif",
  "https://example.test/schedule-viewer/assets/q1/monday.webp",
  "https://example.test/schedule-viewer/assets/q1/week.webp",
  "https://example.test/schedule-viewer/assets/states/inactive.webp",
  "https://example.test/schedule-viewer/assets/states/vacations.webp"
]);

let activation = null;
listeners.get("activate")({
  waitUntil(promise) { activation = promise; }
});
await activation;

assert.deepEqual(deletedCaches.sort(), [
  "schedule-viewer-offline-v2-content",
  "schedule-viewer-old",
  "ucm-scheduler-offline-v1"
].sort());
assert.equal(claimed, true);

assert.match(code, /config\/schedule\.json/);
assert.match(code, /offline-v3/);
assert.match(code, /discoverImageDescriptors/);
assert.match(code, /ignoreSearch/);

console.log("service-worker v3: descubre imágenes anidadas, filtra remotos/data y limpia cachés legacy OK");
