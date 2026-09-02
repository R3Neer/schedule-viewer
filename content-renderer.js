const DAY_ES = {
  sunday: "Domingo",
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado"
};
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function parseMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hourBounds(term) {
  if (!term?.sessions?.length) return [8, 20];
  return [
    Math.floor(Math.min(...term.sessions.map((session) => parseMinutes(session.start))) / 60),
    Math.ceil(Math.max(...term.sessions.map((session) => parseMinutes(session.end))) / 60)
  ];
}

function lookup(config, selection) {
  const year = config.academicYears.find((item) => item.id === selection.academicYearId);
  return {
    year,
    term: year?.terms.find((item) => item.id === selection.termId)
  };
}

function wrapWords(text, maxChars = 32) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function svgDoc(width, height, content, background = "#F4F7FB") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/><style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}.ink{fill:#102A43}.muted{fill:#627D98}.navy{fill:#173F68}</style>${content}</svg>`;
}

function svgDayPhone(config, selection) {
  const { year, term } = lookup(config, selection);
  if (!year || !term || !selection.day) throw new Error("No se puede renderizar la vista diaria.");
  const brand = esc(config.visual?.brand ?? "Schedule Viewer");
  const W = 1000;
  const H = 1850;
  const left = 54;
  const right = 946;
  const top = 285;
  const bottom = 1770;
  const timeCol = 125;
  const [minHour, maxHour] = hourBounds(term);
  const rows = Math.max(1, maxHour - minHour);
  const rowH = (bottom - top) / rows;

  let body = `<rect width="${W}" height="${H}" fill="#fff"/><text x="54" y="72" class="navy" font-size="27" font-weight="700">${brand}</text><text x="946" y="72" class="muted" font-size="19" font-weight="700" text-anchor="end">${esc(year.displayName)}</text><text x="54" y="155" class="ink" font-size="60" font-weight="700">${esc(DAY_ES[selection.day])}</text><text x="54" y="210" class="navy" font-size="25" font-weight="700">${esc(term.displayName)}</text><text x="54" y="247" class="muted" font-size="19">${esc(term.subtitle)}</text><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="22" fill="#F4F7FB" stroke="#D9E2EC" stroke-width="2"/><rect x="${left}" y="${top}" width="${timeCol}" height="${bottom-top}" fill="#EAF2FA"/><line x1="${left+timeCol}" y1="${top}" x2="${left+timeCol}" y2="${bottom}" stroke="#D9E2EC" stroke-width="2"/>`;

  for (let row = 0; row <= rows; row += 1) {
    const y = top + row * rowH;
    body += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#D9E2EC" stroke-width="2"/>`;
    if (row < rows) {
      body += `<text x="${left+timeCol/2}" y="${y+rowH/2+7}" class="navy" font-size="23" font-weight="700" text-anchor="middle">${String(minHour+row).padStart(2,"0")}:00</text>`;
    }
  }

  for (const session of term.sessions.filter((item) => item.day === selection.day)) {
    const subject = term.subjects[session.subject];
    const start = parseMinutes(session.start);
    const end = parseMinutes(session.end);
    const y1 = top + ((start - minHour * 60) / 60) * rowH + 6;
    const y2 = top + ((end - minHour * 60) / 60) * rowH - 6;
    const x1 = left + timeCol + 10;
    const x2 = right - 10;
    body += `<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="18" fill="${subject.fill}" stroke="${subject.accent}" stroke-width="3"/>`;
    const duration = end - start;
    const titleSize = duration <= 60 ? 25 : 29;
    const metaSize = duration <= 60 ? 17 : 19;
    const lines = wrapWords(subject.name, duration <= 60 ? 38 : 34);
    const lineH = titleSize + 5;
    const total = lines.length * lineH + metaSize + 12;
    const centerY = (y1 + y2) / 2;
    const titleY = centerY - total / 2 + titleSize;
    lines.forEach((line, index) => {
      body += `<text x="${x1+22}" y="${titleY+index*lineH}" fill="${subject.accent}" font-size="${titleSize}" font-weight="700">${esc(line)}</text>`;
    });
    body += `<text x="${x1+22}" y="${titleY+lines.length*lineH+4}" class="ink" font-size="${metaSize}">${esc(session.start)}–${esc(session.end)} · ${esc(subject.group)} · ${esc(subject.room)}</text>`;
  }
  return svgDoc(W, H, body, "#fff");
}

function svgWeekPhone(config, selection) {
  const { year, term } = lookup(config, selection);
  if (!year || !term) throw new Error("No se puede renderizar la vista semanal.");
  const brand = esc(config.visual?.brand ?? "Schedule Viewer");
  const W = 2500;
  const H = 1000;
  const left = 62;
  const right = 2438;
  const top = 170;
  const bottom = 950;
  const timeCol = 145;
  const head = 62;
  const [minHour, maxHour] = hourBounds(term);
  const dayW = (right - left - timeCol) / 5;
  const rows = Math.max(1, maxHour - minHour);
  const rowH = (bottom - top - head) / rows;

  let body = `<text x="62" y="68" class="navy" font-size="40" font-weight="700">${brand}</text><text x="2438" y="68" class="muted" font-size="28" font-weight="700" text-anchor="end">${esc(year.displayName)}</text><text x="62" y="128" class="ink" font-size="54" font-weight="700">${esc(term.displayName)}</text><text x="560" y="128" class="muted" font-size="30">${esc(term.subtitle)}</text><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="20" fill="#fff" stroke="#D9E2EC" stroke-width="3"/><rect x="${left}" y="${top}" width="${right-left}" height="${head}" rx="20" fill="#173F68"/><text x="${left+timeCol/2}" y="${top+41}" fill="#fff" font-size="26" font-weight="700" text-anchor="middle">Hora</text>`;

  DAY_ORDER.forEach((day, index) => {
    body += `<text x="${left+timeCol+dayW*(index+.5)}" y="${top+41}" fill="#fff" font-size="28" font-weight="700" text-anchor="middle">${DAY_ES[day]}</text>`;
  });
  for (let index = 0; index <= 5; index += 1) {
    const x = left + timeCol + index * dayW;
    body += `<line x1="${x}" y1="${top+head}" x2="${x}" y2="${bottom}" stroke="#D9E2EC" stroke-width="2"/>`;
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = top + head + row * rowH;
    body += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#D9E2EC" stroke-width="2"/>`;
    if (row < rows) {
      body += `<text x="${left+timeCol/2}" y="${y+rowH/2+8}" class="muted" font-size="23" font-weight="700" text-anchor="middle">${String(minHour+row).padStart(2,"0")}:00</text>`;
    }
  }

  const dayIndex = Object.fromEntries(DAY_ORDER.map((day, index) => [day, index]));
  for (const session of term.sessions) {
    const subject = term.subjects[session.subject];
    const column = dayIndex[session.day];
    if (column == null) continue;
    const start = parseMinutes(session.start);
    const end = parseMinutes(session.end);
    const duration = end - start;
    const y1 = top + head + ((start - minHour * 60) / 60) * rowH + 4;
    const y2 = top + head + ((end - minHour * 60) / 60) * rowH - 4;
    const x1 = left + timeCol + column * dayW + 6;
    const x2 = left + timeCol + (column + 1) * dayW - 6;
    const centerY = (y1 + y2) / 2;
    body += `<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="12" fill="${subject.fill}" stroke="${subject.accent}" stroke-width="2"/>`;
    body += `<text x="${(x1+x2)/2}" y="${centerY-(duration<=60?3:8)}" fill="${subject.accent}" font-size="${duration<=60?25:29}" font-weight="700" text-anchor="middle">${esc(subject.short)}</text>`;
    body += `<text x="${(x1+x2)/2}" y="${centerY+(duration<=60?23:24)}" class="ink" font-size="${duration<=60?18:20}" text-anchor="middle">${esc(subject.group)} · ${esc(subject.room)}</text>`;
  }
  return svgDoc(W, H, body);
}

function svgRangeSummary(config, selection, { viewportWidth = 1600, viewportHeight = 1000, phoneArtwork = false } = {}) {
  const { year, term } = lookup(config, selection);
  if (!year || !term) throw new Error("No se puede renderizar el rango.");
  const landscape = viewportWidth >= viewportHeight;
  const W = phoneArtwork ? (landscape ? 2500 : 1000) : 1600;
  const H = phoneArtwork ? (landscape ? 1000 : 1850) : 1000;
  const margin = Math.round(W * 0.04);
  const brand = esc(config.visual?.brand ?? config.app?.title ?? "Schedule Viewer");
  const range = selection.range;
  let body = `<text x="${margin}" y="${Math.round(H*0.075)}" class="navy" font-size="${Math.round(H*0.04)}" font-weight="700">${brand}</text>`;
  body += `<text x="${margin}" y="${Math.round(H*0.15)}" class="ink" font-size="${Math.round(H*0.055)}" font-weight="700">${esc(term.displayName)}</text>`;
  body += `<text x="${margin}" y="${Math.round(H*0.205)}" class="muted" font-size="${Math.round(H*0.025)}">${esc(range.type)} · ${esc(range.start)} → ${esc(range.end)} · ${range.dayCount} días</text>`;
  body += `<line x1="${margin}" y1="${Math.round(H*0.24)}" x2="${W-margin}" y2="${Math.round(H*0.24)}" stroke="#D9E2EC" stroke-width="3"/>`;

  const gridTop = Math.round(H * 0.29);
  const gridBottom = Math.round(H * 0.92);
  const gap = Math.round(W * 0.008);
  const columnWidth = (W - 2 * margin - 4 * gap) / 5;
  DAY_ORDER.forEach((day, index) => {
    const x = margin + index * (columnWidth + gap);
    body += `<rect x="${x}" y="${gridTop}" width="${columnWidth}" height="${gridBottom-gridTop}" rx="${Math.round(W*0.01)}" fill="#fff" stroke="#D9E2EC" stroke-width="2"/>`;
    body += `<text x="${x+columnWidth/2}" y="${gridTop+Math.round(H*0.055)}" class="navy" font-size="${Math.round(H*0.028)}" font-weight="700" text-anchor="middle">${DAY_ES[day]}</text>`;
    let y = gridTop + Math.round(H * 0.11);
    for (const session of term.sessions.filter((item) => item.day === day)) {
      const subject = term.subjects[session.subject];
      body += `<text x="${x+Math.round(columnWidth*0.08)}" y="${y}" fill="${subject.accent}" font-size="${Math.round(H*0.022)}" font-weight="700">${esc(session.start)} ${esc(subject.short)}</text>`;
      y += Math.round(H * 0.052);
      if (y > gridBottom - Math.round(H*0.04)) break;
    }
  });
  return svgDoc(W, H, body);
}

export function renderGeneratedSvg(config, selection, options = {}) {
  switch (selection.content?.view) {
    case "day":
      return svgDayPhone(config, selection);
    case "week":
      return svgWeekPhone(config, selection);
    case "range":
      return svgRangeSummary(config, selection, options);
    default:
      throw new Error(`Vista generada desconocida: ${selection.content?.view ?? "(vacía)"}`);
  }
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolveAssetUrl(src, baseURI) {
  return new URL(src, baseURI).href;
}

export function renderSelectionContent(config, selection, {
  baseURI,
  viewportWidth,
  viewportHeight,
  phoneArtwork = false
}) {
  const content = selection.content;
  if (!content) throw new Error("La selección no contiene ContentDescriptor.");

  if (content.type === "image") {
    const src = resolveAssetUrl(content.src, baseURI);
    return {
      contentType: "image",
      src,
      fallbackSrc: null,
      fit: content.fit ?? "contain",
      cacheKey: `image:${src}`
    };
  }

  if (content.type !== "generated-schedule") {
    throw new Error(`Tipo de contenido no renderizable: ${content.type}`);
  }

  const generated = svgDataUrl(renderGeneratedSvg(config, selection, {
    viewportWidth,
    viewportHeight,
    phoneArtwork
  }));
  if (phoneArtwork || !content.fallbackSrc) {
    return {
      contentType: "generated-schedule",
      src: generated,
      fallbackSrc: null,
      fit: "contain",
      cacheKey: `svg:${selection.viewId}:${selection.range.start}:${selection.range.end}:${viewportWidth}x${viewportHeight}`
    };
  }

  const primary = resolveAssetUrl(content.fallbackSrc, baseURI);
  return {
    contentType: "generated-schedule",
    src: primary,
    fallbackSrc: generated,
    fit: "contain",
    cacheKey: `asset:${primary}`
  };
}
