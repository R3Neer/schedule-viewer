const DAY_ES = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes" };
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function parseMinutes(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function hourBounds(term) {
  return [
    Math.floor(Math.min(...term.sessions.map((s) => parseMinutes(s.start))) / 60),
    Math.ceil(Math.max(...term.sessions.map((s) => parseMinutes(s.end))) / 60)
  ];
}

function lookup(config, selection) {
  const year = config.academicYears.find((item) => item.id === selection.academicYearId);
  return { year, term: year?.terms.find((item) => item.id === selection.termId) };
}

function wrapWords(text, maxChars = 32) {
  const lines = []; let line = "";
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function svgDoc(w, h, content, background = "#F4F7FB") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${background}"/><style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}.ink{fill:#102A43}.muted{fill:#627D98}.navy{fill:#173F68}</style>${content}</svg>`;
}

function svgNoClassPhone(config) {
  const brand = esc(config.visual?.brand ?? "UCM · FdI");
  return svgDoc(1000, 1850, `<rect width="1000" height="1850" fill="#fff"/><text x="54" y="78" class="navy" font-size="28" font-weight="700">${brand}</text><text x="54" y="170" class="ink" font-size="62" font-weight="700">Hoy</text><line x1="54" y1="208" x2="946" y2="208" stroke="#D9E2EC" stroke-width="2"/><rect x="54" y="255" width="892" height="1500" rx="26" fill="#F4F7FB" stroke="#D9E2EC" stroke-width="2"/><rect x="118" y="690" width="764" height="430" rx="32" fill="#EAF2FA" stroke="#173F68" stroke-width="3"/><text x="500" y="860" class="ink" font-size="56" font-weight="700" text-anchor="middle">Sin clases hoy</text><text x="500" y="950" class="muted" font-size="23" text-anchor="middle">Festivo · fin de semana</text><text x="500" y="990" class="muted" font-size="23" text-anchor="middle">día no lectivo · vacaciones</text>`, "#fff");
}

function svgVacationsPhoneLandscape(config) {
  const brand = esc(config.visual?.brand ?? "UCM · FdI");
  const title = esc(config.visual?.title ?? "Ingeniería Informática");
  return svgDoc(2500, 1000, `<text x="70" y="92" class="navy" font-size="42" font-weight="700">${brand}</text><text x="2430" y="92" class="muted" font-size="30" font-weight="700" text-anchor="end">${title}</text><line x1="70" y1="130" x2="2430" y2="130" stroke="#D9E2EC" stroke-width="3"/><rect x="190" y="215" width="2120" height="650" rx="42" fill="#fff" stroke="#D9E2EC" stroke-width="3"/><text x="1250" y="590" class="ink" font-size="150" font-weight="700" text-anchor="middle">Vacaciones</text>`);
}

function svgDayPhone(config, selection) {
  const { year, term } = lookup(config, selection); if (!year || !term || !selection.day) return svgNoClassPhone(config);
  const brand = esc(config.visual?.brand ?? "UCM · FdI");
  const W=1000,H=1850,left=54,right=946,top=285,bottom=1770,timeCol=125;
  const [minHour,maxHour]=hourBounds(term), rows=maxHour-minHour, rowH=(bottom-top)/rows;
  let body=`<rect width="${W}" height="${H}" fill="#fff"/><text x="54" y="72" class="navy" font-size="27" font-weight="700">${brand}</text><text x="946" y="72" class="muted" font-size="19" font-weight="700" text-anchor="end">${esc(year.displayName)}</text><text x="54" y="155" class="ink" font-size="60" font-weight="700">${esc(DAY_ES[selection.day])}</text><text x="54" y="210" class="navy" font-size="25" font-weight="700">${esc(term.displayName)}</text><text x="54" y="247" class="muted" font-size="19">${esc(term.subtitle)}</text><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="22" fill="#F4F7FB" stroke="#D9E2EC" stroke-width="2"/><rect x="${left}" y="${top}" width="${timeCol}" height="${bottom-top}" fill="#EAF2FA"/><line x1="${left+timeCol}" y1="${top}" x2="${left+timeCol}" y2="${bottom}" stroke="#D9E2EC" stroke-width="2"/>`;
  for(let r=0;r<=rows;r++){
    const y=top+r*rowH; body+=`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#D9E2EC" stroke-width="2"/>`;
    if(r<rows) body+=`<text x="${left+timeCol/2}" y="${y+rowH/2+7}" class="navy" font-size="23" font-weight="700" text-anchor="middle">${String(minHour+r).padStart(2,"0")}:00</text>`;
  }
  for(const session of term.sessions.filter((s)=>s.day===selection.day)){
    const subj=term.subjects[session.subject],start=parseMinutes(session.start),end=parseMinutes(session.end);
    const y1=top+((start-minHour*60)/60)*rowH+6,y2=top+((end-minHour*60)/60)*rowH-6,x1=left+timeCol+10,x2=right-10;
    body+=`<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="18" fill="${subj.fill}" stroke="${subj.accent}" stroke-width="3"/>`;
    const duration=end-start, titleSize=duration<=60?25:29,metaSize=duration<=60?17:19,maxChars=duration<=60?38:34,lines=wrapWords(subj.name,maxChars);
    const lineH=titleSize+5, total=lines.length*lineH+metaSize+12, cy=(y1+y2)/2, ty=cy-total/2+titleSize;
    lines.forEach((line,i)=>body+=`<text x="${x1+22}" y="${ty+i*lineH}" fill="${subj.accent}" font-size="${titleSize}" font-weight="700">${esc(line)}</text>`);
    body+=`<text x="${x1+22}" y="${ty+lines.length*lineH+4}" class="ink" font-size="${metaSize}">${esc(session.start)}–${esc(session.end)} · ${esc(subj.group)} · ${esc(subj.room)}</text>`;
  }
  return svgDoc(W,H,body,"#fff");
}

function svgWeekPhone(config, selection) {
  const { year, term }=lookup(config, selection); if(!year||!term) return svgVacationsPhoneLandscape(config);
  const brand = esc(config.visual?.brand ?? "UCM · FdI");
  const W=2500,H=1000,left=62,right=2438,top=170,bottom=950,timeCol=145,head=62;
  const [minHour,maxHour]=hourBounds(term),dayW=(right-left-timeCol)/5,rows=maxHour-minHour,rowH=(bottom-top-head)/rows;
  let body=`<text x="62" y="68" class="navy" font-size="40" font-weight="700">${brand}</text><text x="2438" y="68" class="muted" font-size="28" font-weight="700" text-anchor="end">${esc(year.displayName)}</text><text x="62" y="128" class="ink" font-size="54" font-weight="700">${esc(term.displayName)}</text><text x="560" y="128" class="muted" font-size="30">${esc(term.subtitle)}</text><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="20" fill="#fff" stroke="#D9E2EC" stroke-width="3"/><rect x="${left}" y="${top}" width="${right-left}" height="${head}" rx="20" fill="#173F68"/><text x="${left+timeCol/2}" y="${top+41}" fill="#fff" font-size="26" font-weight="700" text-anchor="middle">Hora</text>`;
  DAY_ORDER.forEach((day,i)=>body+=`<text x="${left+timeCol+dayW*(i+.5)}" y="${top+41}" fill="#fff" font-size="28" font-weight="700" text-anchor="middle">${DAY_ES[day]}</text>`);
  for(let i=0;i<=5;i++){const x=left+timeCol+i*dayW;body+=`<line x1="${x}" y1="${top+head}" x2="${x}" y2="${bottom}" stroke="#D9E2EC" stroke-width="2"/>`;}
  for(let r=0;r<=rows;r++){const y=top+head+r*rowH;body+=`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#D9E2EC" stroke-width="2"/>`;if(r<rows)body+=`<text x="${left+timeCol/2}" y="${y+rowH/2+8}" class="muted" font-size="23" font-weight="700" text-anchor="middle">${String(minHour+r).padStart(2,"0")}:00</text>`;}
  const dayIndex=Object.fromEntries(DAY_ORDER.map((d,i)=>[d,i]));
  for(const session of term.sessions){
    const subj=term.subjects[session.subject],col=dayIndex[session.day],start=parseMinutes(session.start),end=parseMinutes(session.end),duration=end-start;
    const y1=top+head+((start-minHour*60)/60)*rowH+4,y2=top+head+((end-minHour*60)/60)*rowH-4,x1=left+timeCol+col*dayW+6,x2=left+timeCol+(col+1)*dayW-6,cy=(y1+y2)/2;
    body+=`<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="12" fill="${subj.fill}" stroke="${subj.accent}" stroke-width="2"/>`;
    const titleSize=duration<=60?25:29,metaSize=duration<=60?18:20;
    body+=`<text x="${(x1+x2)/2}" y="${cy-(duration<=60?3:8)}" fill="${subj.accent}" font-size="${titleSize}" font-weight="700" text-anchor="middle">${esc(subj.short)}</text>`;
    body+=`<text x="${(x1+x2)/2}" y="${cy+(duration<=60?23:24)}" class="ink" font-size="${metaSize}" text-anchor="middle">${esc(subj.group)} · ${esc(subj.room)}</text>`;
  }
  return svgDoc(W,H,body);
}

export function renderGeneratedSvg(config, selection) {
  switch (selection.content?.view) {
    case "no-class": return svgNoClassPhone(config);
    case "vacations": return svgVacationsPhoneLandscape(config);
    case "day": return svgDayPhone(config, selection);
    case "week": return svgWeekPhone(config, selection);
    default: throw new Error(`Vista generada desconocida: ${selection.content?.view ?? "(vacía)"}`);
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
  phoneArtwork
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

  const generated = svgDataUrl(renderGeneratedSvg(config, selection));
  if (phoneArtwork || !content.fallbackSrc) {
    return {
      contentType: "generated-schedule",
      src: generated,
      fallbackSrc: null,
      fit: "contain",
      cacheKey: `svg:${selection.kind}:${selection.termId ?? "state"}:${selection.day ?? ""}:${viewportWidth}x${viewportHeight}`
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
