const image = (src, alt = "") => ({ type: "image", src, fit: "contain", alt });

function period(id, name, start, end) {
  return {
    id, name, start, end,
    images: {
      active: {
        vertical: {
          default: image(`assets/${id}/vertical.webp`, `${name}, vista vertical`),
          days: {
            monday: image(`assets/${id}/monday.webp`, "Lunes"),
            saturday: image(`assets/${id}/saturday.webp`, "Sábado activo")
          },
          weeks: { [start]: image(`assets/${id}/week-1.webp`, "Primera semana") },
          months: { [start.slice(0, 7)]: image(`assets/${id}/month-1.webp`, "Primer mes") }
        },
        horizontal: image(`assets/${id}/horizontal.webp`, `${name}, vista horizontal`)
      },
      inactive: {
        vertical: image("assets/states/inactive-vertical.webp", "Día inactivo"),
        horizontal: image("assets/states/inactive-horizontal.webp", "Periodo inactivo"),
        weekdays: { sunday: image("assets/states/sunday.webp", "Domingo") }
      }
    }
  };
}

export function makeConfig() {
  return {
    version: 4,
    app: { timezone: "Europe/Madrid" },
    defaults: { weekStartsOn: "monday", imageFit: "contain" },
    runtime: { allowDateOverride: true, demo: true },
    presentation: { vertical: { unit: "day" }, desktopToggle: true },
    calendar: {
      activeWeekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      exceptions: [
        { id: "holiday", date: "2026-10-12", name: "Festivo", state: "inactive", kind: "holiday", images: {} },
        { id: "open-saturday", date: "2026-10-17", name: "Apertura", state: "active", kind: "other", images: {} },
        { id: "closure", date: "2026-11-13", name: "Cierre", state: "inactive", kind: "closure", images: {
          vertical: image("assets/states/closure.webp", "Cierre")
        } }
      ],
      inactivePeriods: [
        { id: "winter", name: "Invierno", start: "2026-12-12", end: "2027-01-24", kind: "vacation", images: {
          horizontal: image("assets/states/winter.webp", "Invierno")
        } }
      ]
    },
    periods: [
      period("autumn", "Otoño", "2026-09-07", "2026-12-20"),
      period("spring", "Primavera", "2027-01-25", "2027-05-07")
    ]
  };
}

export function makeSourceConfig() {
  const config = makeConfig();
  return {
    ...config,
    defaults: { week_starts_on: "monday", image_fit: "contain" },
    runtime: { allow_date_override: true, demo: true },
    presentation: { vertical: { unit: "day" }, desktop_toggle: true },
    calendar: {
      active_weekdays: config.calendar.activeWeekdays,
      exceptions: config.calendar.exceptions,
      inactive_periods: config.calendar.inactivePeriods
    }
  };
}
