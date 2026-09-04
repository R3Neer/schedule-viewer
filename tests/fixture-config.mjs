export function makeConfig() {
  const dayAssets = (term) => Object.fromEntries(
    ["monday","tuesday","wednesday","thursday","friday"].map((day) => [day, `assets/${term}/${day}.webp`])
  );
  return {
    version: 3,
    app: { title: "Schedule Viewer", timezone: "Europe/Madrid" },
    timezone: "Europe/Madrid",
    defaults: { weekStartsOn: "monday", imageFit: "contain" },
    runtime: { allowDateOverride: true },
    visual: {
      brand: "Test",
      title: "Horario",
      palette: {
        background: "#F4F7FB", paper: "#FFFFFF", ink: "#102A43",
        muted: "#627D98", line: "#D9E2EC", navy: "#173F68", navySoft: "#EAF2FA"
      }
    },
    states: {
      noClassTodayVertical: "assets/states/inactive.webp",
      vacationsHorizontal: "assets/states/vacations.webp"
    },
    calendar: {
      inactive: {
        defaultImage: {
          type: "image", src: "assets/states/inactive.webp", fit: "contain", alt: "Sin clases"
        }
      },
      inactiveWeekdays: { saturday: {}, sunday: {} },
      activeDates: [],
      inactiveDates: []
    },
    views: {
      phone_portrait: {
        id: "phone_portrait", priority: 100, order: 0, manualOnly: false,
        when: { orientation: "portrait", maxWidth: 760 },
        range: { type: "day" },
        renderer: { type: "timetable", artwork: "phone" }
      },
      phone_landscape: {
        id: "phone_landscape", priority: 100, order: 1, manualOnly: false,
        when: { orientation: "landscape", maxWidth: 950, maxHeight: 520 },
        range: { type: "week", startsOn: "monday" },
        renderer: { type: "timetable", artwork: "phone" }
      },
      wide_default: {
        id: "wide_default", priority: 10, order: 2, manualOnly: false,
        when: { minWidth: 761 },
        range: { type: "week", startsOn: "monday" },
        renderer: { type: "timetable", artwork: "asset" }
      },
      desktop_portrait: {
        id: "desktop_portrait", priority: 0, order: 3, manualOnly: true,
        when: {},
        range: { type: "day" },
        renderer: { type: "timetable", artwork: "asset" }
      }
    },
    desktop: {
      when: { minWidth: 1000 },
      primaryView: "wide_default",
      secondaryView: "desktop_portrait",
      defaultView: "wide_default",
      shortcuts: { toggleView: { key: "Space" } }
    },
    academicYears: [{
      id: "2026-2027",
      displayName: "Curso 2026–2027",
      calendar: {
        terms: [
          { termId: "q1", start: "2026-09-07", end: "2026-12-11" },
          { termId: "q2", start: "2027-01-25", end: "2027-05-07" }
        ],
        holidays: [
          { date: "2026-10-12", label: "Festivo" },
          { date: "2026-12-25", label: "Navidad", image: { type: "image", src: "assets/inactive/holiday.svg", fit: "contain", alt: "Navidad" } }
        ],
        inactiveDates: [
          { date: "2026-11-13", type: "non-teaching", label: "No lectivo" }
        ],
        periods: [
          { id: "winter", type: "vacation", start: "2026-12-12", end: "2027-01-24", priority: 0, label: "Invierno",
            image: { type: "image", src: "assets/inactive/winter.svg", fit: "contain", alt: "Invierno" } },
          { id: "easter", type: "vacation", start: "2027-03-19", end: "2027-03-29", priority: 0, label: "Pascua" },
          { id: "summer", type: "vacation", start: "2027-05-08", end: "2027-09-06", priority: 0, label: "Verano" }
        ]
      },
      terms: [
        {
          id: "q1", displayName: "Q1", subtitle: "Test",
          assets: { week: "assets/q1/week.webp", days: dayAssets("q1") },
          content: {},
          subjects: {
            A: { name: "Asignatura A", short: "A", group: "G", room: "R", fill: "#ddd", accent: "#333" }
          },
          sessions: [
            { day: "monday", start: "09:00", end: "11:00", subject: "A" },
            { day: "wednesday", start: "11:00", end: "13:00", subject: "A" }
          ]
        },
        {
          id: "q2", displayName: "Q2", subtitle: "Test",
          assets: { week: "assets/q2/week.webp", days: dayAssets("q2") },
          content: {},
          subjects: {
            B: { name: "Asignatura B", short: "B", group: "G", room: "R", fill: "#eee", accent: "#444" }
          },
          sessions: [
            { day: "tuesday", start: "10:00", end: "12:00", subject: "B" }
          ]
        }
      ]
    }],
    rules: [
      {
        priority: 400, order: 0,
        when: { view: ["phone_landscape", "wide_default"], dateRange: { start: "2027-01-18", end: "2027-01-24" } },
        content: { type: "term-schedule", academicYear: "2026-2027", term: "q2", range: { type: "week", startsOn: "monday" } }
      },
      {
        priority: 300, order: 1,
        when: { view: ["phone_landscape", "wide_default"], calendarStatus: ["vacation"] },
        content: { type: "image", src: "assets/states/vacations.webp", fit: "contain", alt: "Vacaciones" }
      },
      {
        priority: 250, order: 2,
        when: { view: ["phone_landscape", "wide_default"], calendarStatus: ["holiday", "non-teaching", "inactive-weekday"] },
        content: { type: "current-term-schedule" }
      },
      {
        priority: 200, order: 3,
        when: { view: ["phone_landscape", "wide_default"], calendarStatus: ["out-of-term"] },
        content: { type: "next-term-schedule" }
      },
      {
        priority: 100, order: 4,
        when: { view: ["phone_portrait", "desktop_portrait"], calendarStatus: ["holiday", "non-teaching", "inactive-weekday", "vacation", "out-of-term"] },
        content: { type: "inactive-image" }
      }
    ]
  };
}
