const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const IMAGE_FITS = new Set(["contain", "cover", "fill", "none", "scale-down"]);

export function compareDate(a, b) { return a.localeCompare(b); }
export function inRange(date, start, end) { return compareDate(date, start) >= 0 && compareDate(date, end) <= 0; }

export function dayKeyFromIso(date) {
  const [year, month, day] = date.split("-").map(Number);
  return DAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function isWeekend(date) {
  const day = dayKeyFromIso(date);
  return day === "saturday" || day === "sunday";
}

export function getDateInTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeContentDescriptor(descriptor, defaults = {}) {
  if (descriptor == null) return null;

  if (typeof descriptor === "string") {
    if (!descriptor) throw new TypeError("La ruta de imagen no puede estar vacía.");
    return {
      type: "image",
      src: descriptor,
      fit: defaults.fit ?? "contain",
      alt: defaults.alt
    };
  }

  if (typeof descriptor !== "object" || Array.isArray(descriptor)) {
    throw new TypeError("El contenido debe ser una cadena o un objeto.");
  }

  if (descriptor.type === "image") {
    if (typeof descriptor.src !== "string" || !descriptor.src) {
      throw new TypeError("El contenido image requiere src.");
    }
    const fit = descriptor.fit ?? defaults.fit ?? "contain";
    if (!IMAGE_FITS.has(fit)) throw new TypeError(`object-fit no soportado: ${fit}`);
    return {
      type: "image",
      src: descriptor.src,
      fit,
      alt: descriptor.alt ?? defaults.alt
    };
  }

  if (descriptor.type === "generated-schedule") {
    return {
      type: "generated-schedule",
      view: descriptor.view ?? defaults.view,
      fallbackSrc: descriptor.fallbackSrc ?? defaults.fallbackSrc ?? null,
      alt: descriptor.alt ?? defaults.alt
    };
  }

  throw new TypeError(`Tipo de contenido desconocido: ${descriptor.type ?? "(sin type)"}`);
}

function scheduleFor(year, termId) {
  return year.terms?.find((term) => term.id === termId) ?? null;
}

function calendarTermFor(year, termId) {
  return year.calendar?.terms?.find((term) => term.termId === termId) ?? null;
}

function combinedTerm(year, calendarTerm) {
  const schedule = scheduleFor(year, calendarTerm.termId);
  if (!schedule) return null;
  return { ...schedule, start: calendarTerm.start, end: calendarTerm.end };
}

function hasWeekPresentation(term) {
  return Boolean(term?.content?.week || term?.assets?.week);
}

export function flattenTerms(config) {
  return config.academicYears
    .flatMap((year) => (year.calendar?.terms ?? []).map((calendarTerm) => {
      const term = combinedTerm(year, calendarTerm);
      return term ? { academicYear: year, term } : null;
    }).filter(Boolean))
    .sort((a, b) => compareDate(a.term.start, b.term.start));
}

export function findActiveTerm(config, date) {
  return flattenTerms(config).find(({ term }) => inRange(date, term.start, term.end)) ?? null;
}

export function findNextTerm(config, date) {
  return flattenTerms(config).find(({ term }) => compareDate(term.start, date) > 0 && hasWeekPresentation(term)) ?? null;
}

function academicYearBounds(year) {
  const ranges = [
    ...(year.calendar?.terms ?? []).map(({ start, end }) => ({ start, end })),
    ...(year.calendar?.vacations ?? []).map(({ start, end }) => ({ start, end }))
  ];
  if (!ranges.length) return null;
  return {
    start: ranges.map((item) => item.start).sort()[0],
    end: ranges.map((item) => item.end).sort().at(-1)
  };
}

export function findAcademicYear(config, date) {
  const containingTerm = findActiveTerm(config, date);
  if (containingTerm) return containingTerm.academicYear;

  const years = config.academicYears
    .map((year) => ({ year, bounds: academicYearBounds(year) }))
    .filter(({ bounds }) => bounds);

  const exact = years.find(({ bounds }) => inRange(date, bounds.start, bounds.end));
  if (exact) return exact.year;

  const next = years.find(({ bounds }) => compareDate(bounds.start, date) > 0);
  if (next) return next.year;

  return years.at(-1)?.year ?? null;
}

export function isHolidayDate(academicYear, date) {
  return Boolean(academicYear?.calendar?.holidays?.some((entry) => entry.date === date));
}

export function isNonTeachingDay(academicYear, date) {
  return Boolean(academicYear?.calendar?.nonTeachingDays?.some((entry) => entry.date === date));
}

export function findVacation(academicYear, date) {
  return academicYear?.calendar?.vacations?.find((period) => inRange(date, period.start, period.end)) ?? null;
}

function resolveVacationNextTerm(config, academicYear, vacation, date) {
  if (!vacation?.nextTermId || !vacation?.showNextTermFrom || compareDate(date, vacation.showNextTermFrom) < 0) {
    return null;
  }
  const targetYearId = vacation.nextAcademicYearId ?? academicYear.id;
  const targetYear = config.academicYears.find((year) => year.id === targetYearId);
  if (!targetYear) return null;
  const calendarTerm = calendarTermFor(targetYear, vacation.nextTermId);
  if (!calendarTerm) return null;
  const term = combinedTerm(targetYear, calendarTerm);
  return term && hasWeekPresentation(term) ? { academicYear: targetYear, term } : null;
}

function stateContent(config, key, defaults) {
  const custom = config.content?.states?.[key];
  return normalizeContentDescriptor(
    custom ?? { type: "generated-schedule" },
    defaults
  );
}

function dayContent(term, day, defaults) {
  const custom = term.content?.days?.[day];
  return normalizeContentDescriptor(
    custom ?? { type: "generated-schedule" },
    defaults
  );
}

function weekContent(term, defaults) {
  const custom = term.content?.week;
  return normalizeContentDescriptor(
    custom ?? { type: "generated-schedule" },
    defaults
  );
}

function withContent(base, content, defaultAlt) {
  return {
    ...base,
    alt: content.alt ?? defaultAlt,
    content
  };
}

export function selectScheduleContent(config, { date, portraitNarrow }) {
  const active = findActiveTerm(config, date);
  const academicYear = active?.academicYear ?? findAcademicYear(config, date);
  const vacation = findVacation(academicYear, date);
  const noClassToday = isWeekend(date)
    || !active
    || isHolidayDate(academicYear, date)
    || isNonTeachingDay(academicYear, date)
    || Boolean(vacation);

  if (portraitNarrow) {
    if (noClassToday) {
      const alt = "Sin clases hoy";
      return withContent(
        { kind: "no-class" },
        stateContent(config, "noClassToday", {
          view: "no-class",
          fallbackSrc: config.states.noClassTodayVertical,
          alt
        }),
        alt
      );
    }

    const day = dayKeyFromIso(date);
    const alt = `${active.term.displayName}, horario del ${day}`;
    return withContent(
      {
        kind: "day",
        academicYearId: active.academicYear.id,
        termId: active.term.id,
        day
      },
      dayContent(active.term, day, {
        view: "day",
        fallbackSrc: active.term.assets?.days?.[day] ?? null,
        alt
      }),
      alt
    );
  }

  if (vacation) {
    const next = resolveVacationNextTerm(config, academicYear, vacation, date);
    if (next) {
      const alt = `${next.term.displayName}, próximo horario semanal`;
      return withContent(
        {
          kind: "next-week",
          academicYearId: next.academicYear.id,
          termId: next.term.id
        },
        weekContent(next.term, {
          view: "week",
          fallbackSrc: next.term.assets?.week ?? null,
          alt
        }),
        alt
      );
    }

    const alt = "Vacaciones";
    return withContent(
      { kind: "vacations" },
      stateContent(config, "vacations", {
        view: "vacations",
        fallbackSrc: config.states.vacationsHorizontal,
        alt
      }),
      alt
    );
  }

  if (active) {
    const alt = `${active.term.displayName}, horario semanal`;
    return withContent(
      {
        kind: "week",
        academicYearId: active.academicYear.id,
        termId: active.term.id
      },
      weekContent(active.term, {
        view: "week",
        fallbackSrc: active.term.assets?.week ?? null,
        alt
      }),
      alt
    );
  }

  const next = findNextTerm(config, date);
  if (next) {
    const alt = `${next.term.displayName}, próximo horario semanal`;
    return withContent(
      {
        kind: "next-week",
        academicYearId: next.academicYear.id,
        termId: next.term.id
      },
      weekContent(next.term, {
        view: "week",
        fallbackSrc: next.term.assets?.week ?? null,
        alt
      }),
      alt
    );
  }

  const alt = "Vacaciones";
  return withContent(
    { kind: "vacations" },
    stateContent(config, "vacations", {
      view: "vacations",
      fallbackSrc: config.states.vacationsHorizontal,
      alt
    }),
    alt
  );
}

// Compatibilidad con la API anterior. El runtime nuevo usa selectScheduleContent.
export function selectScheduleAsset(config, options) {
  const selection = selectScheduleContent(config, options);
  const path = selection.content.type === "image"
    ? selection.content.src
    : selection.content.fallbackSrc;
  return { ...selection, path: path ?? null };
}

export function collectCustomContentAssetPaths(config) {
  const paths = new Set();

  function add(descriptor) {
    if (descriptor == null) return;
    const content = normalizeContentDescriptor(descriptor);
    if (content.type !== "image") return;
    if (/^(?:data|blob):/i.test(content.src)) return;
    paths.add(content.src);
  }

  for (const descriptor of Object.values(config.content?.states ?? {})) add(descriptor);

  for (const year of config.academicYears ?? []) {
    for (const term of year.terms ?? []) {
      add(term.content?.week);
      for (const descriptor of Object.values(term.content?.days ?? {})) add(descriptor);
    }
  }

  return [...paths];
}
