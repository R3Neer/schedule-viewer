// These were public placeholders in the original neutral configuration. Keep
// the migration exact so real, user-authored labels are never renamed.
const LEGACY_LABELS = new Map([
  ["Horario de ejemplo", "Horario"],
  ["Ejemplo 2026–2027", "Curso 2026–2027"],
  ["Día festivo de ejemplo", "Día festivo"],
  ["Día no lectivo de ejemplo", "Día no lectivo"]
]);

function rename(value) {
  return LEGACY_LABELS.get(value) ?? value;
}

export function renameLegacyDemoLabels(config) {
  let changed = false;
  const replace = (object, key) => {
    if (!object || typeof object[key] !== "string") return;
    const next = rename(object[key]);
    if (next !== object[key]) {
      object[key] = next;
      changed = true;
    }
  };

  replace(config.visual ?? {}, "title");
  for (const year of config.academicYears ?? []) {
    replace(year, "displayName");
    for (const holiday of year.calendar?.holidays ?? []) replace(holiday, "label");
    for (const date of year.calendar?.inactiveDates ?? []) replace(date, "label");
  }
  return changed;
}

export function renameLegacyDemoYaml(yaml) {
  if (typeof yaml !== "string") return yaml;
  let result = yaml;
  for (const [before, after] of LEGACY_LABELS) result = result.replaceAll(before, after);
  return result;
}
