import assert from "node:assert/strict";
import { renameLegacyDemoLabels, renameLegacyDemoYaml } from "../demo-labels.js";

const config = {
  visual: { title: "Horario de ejemplo" },
  academicYears: [{
    displayName: "Ejemplo 2026–2027",
    calendar: {
      holidays: [{ label: "Día festivo de ejemplo" }, { label: "Puente local" }],
      inactiveDates: [{ label: "Día no lectivo de ejemplo" }, { label: "Tutoría" }]
    }
  }]
};
assert.equal(renameLegacyDemoLabels(config), true);
assert.deepEqual(config, {
  visual: { title: "Horario" },
  academicYears: [{
    displayName: "Curso 2026–2027",
    calendar: {
      holidays: [{ label: "Día festivo" }, { label: "Puente local" }],
      inactiveDates: [{ label: "Día no lectivo" }, { label: "Tutoría" }]
    }
  }]
});
assert.equal(renameLegacyDemoLabels(config), false);
assert.equal(renameLegacyDemoYaml("title: Horario de ejemplo\nlabel: Día festivo de ejemplo\n"), "title: Horario\nlabel: Día festivo\n");
assert.equal(renameLegacyDemoYaml(null), null);
console.log("demo-labels: solo migra los rótulos públicos heredados exactos");
