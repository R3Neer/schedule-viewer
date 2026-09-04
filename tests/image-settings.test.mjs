import assert from "node:assert/strict";
import { imagePeriods, imageTargets } from "../settings-ui.js";
import { makeConfig } from "./fixture-config.mjs";

const config = makeConfig();
assert.deepEqual(imagePeriods(config).map(item => item.key), ["autumn", "spring"]);
let targets = imageTargets(config, "autumn");
assert.equal(targets.filter(item => item.required).length, 4);
assert.equal(targets.filter(item => item.key.includes(":active:horizontal")).length, 1, "horizontal es una sola imagen fija");
assert.ok(targets.some(item => item.key === "autumn:active:day:saturday"), "una excepción activa hace aparecer el sábado");
assert.ok(!targets.some(item => item.key === "autumn:active:day:sunday"));
assert.ok(targets.some(item => item.key === "autumn:inactive:weekday:saturday"));
assert.ok(targets.some(item => item.key === "exception:holiday:horizontal"));
assert.ok(targets.some(item => item.key === "interval:winter:vertical"));

const weekly = makeConfig();
weekly.presentation.vertical.unit = "week";
targets = imageTargets(weekly, "autumn");
const weeks = targets.filter(item => item.group === "Vertical · Semana");
assert.ok(weeks.length >= 15, "usa semanas reales del intervalo, incluidas las parciales");
assert.match(weeks[0].label, /sept 2026/);

const monthly = makeConfig();
monthly.presentation.vertical.unit = "month";
targets = imageTargets(monthly, "autumn");
assert.deepEqual(targets.filter(item => item.group === "Vertical · Mes").map(item => item.key.split(":").at(-1)), ["2026-09", "2026-10", "2026-11", "2026-12"]);

console.log("image-settings: destinos verticales efectivos, horizontal fijo e inactivos jerárquicos OK");
