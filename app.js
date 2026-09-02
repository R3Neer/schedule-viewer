import { getDateInTimezone, selectScheduleAsset } from "./schedule-core.js";

const image = document.querySelector("#schedule-image");
const errorBox = document.querySelector("#error-message");
let config = null;
let currentPath = null;
let currentSelection = null;
let resizeTimer = null;

const DAY_ES = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes" };
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function getRequestedDate() {
  const override = new URLSearchParams(window.location.search).get("date");
  if (override && config.runtime?.allowDateOverride && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return getDateInTimezone(config.timezone);
}

function isPortraitNarrow() {
  return window.innerWidth < config.runtime.mobileVerticalMaxWidth && window.innerHeight >= window.innerWidth;
}

function resolveAssetUrl(path) { return new URL(path, document.baseURI).href; }
function parseMinutes(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function hourBounds(term) {
  return [
    Math.floor(Math.min(...term.sessions.map((s) => parseMinutes(s.start))) / 60),
    Math.ceil(Math.max(...term.sessions.map((s) => parseMinutes(s.end))) / 60)
  ];
}

function lookup(selection) {
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

function svgNoClass() {
  return svgDoc(1080, 2160, `<rect width="1080" height="2160" fill="#fff"/><text x="72" y="95" class="navy" font-size="31" font-weight="700">UCM · FdI</text><text x="72" y="220" class="ink" font-size="72" font-weight="700">Hoy</text><line x1="72" y1="260" x2="1008" y2="260" stroke="#D9E2EC" stroke-width="2"/><rect x="72" y="390" width="936" height="1440" rx="28" fill="#F4F7FB" stroke="#D9E2EC" stroke-width="2"/><rect x="150" y="850" width="780" height="520" rx="34" fill="#EAF2FA" stroke="#173F68" stroke-width="3"/><text x="540" y="1060" class="ink" font-size="58" font-weight="700" text-anchor="middle">Sin clases hoy</text><text x="540" y="1155" class="muted" font-size="24" text-anchor="middle">Festivo · fin de semana · día no lectivo · vacaciones</text>`, "#fff");
}

function svgVacations() {
  return svgDoc(1600, 1000, `<text x="72" y="88" class="navy" font-size="30" font-weight="700">UCM · FdI</text><text x="72" y="130" class="muted" font-size="22">Ingeniería Informática</text><line x1="72" y1="150" x2="1528" y2="150" stroke="#D9E2EC" stroke-width="2"/><rect x="160" y="255" width="1280" height="585" rx="36" fill="#fff" stroke="#D9E2EC" stroke-width="2"/><text x="800" y="590" class="ink" font-size="100" font-weight="700" text-anchor="middle">Vacaciones</text>`);
}

function svgDay(selection) {
  const { year, term } = lookup(selection); if (!year || !term || !selection.day) return svgNoClass();
  const [minHour, maxHour] = hourBounds(term), left = 72, top = 390, right = 1008, bottom = 2010, timeCol = 150;
  const rows = maxHour - minHour, rowH = (bottom - top) / rows;
  let body = `<rect width="1080" height="2160" fill="#fff"/><text x="72" y="95" class="navy" font-size="31" font-weight="700">UCM · FdI</text><text x="1008" y="95" class="muted" font-size="21" font-weight="700" text-anchor="end">${esc(year.displayName)}</text><text x="72" y="220" class="ink" font-size="72" font-weight="700">${esc(DAY_ES[selection.day])}</text><text x="72" y="290" class="navy" font-size="29" font-weight="700">${esc(term.displayName)}</text><text x="72" y="330" class="muted" font-size="22">${esc(term.subtitle)}</text><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="24" fill="#F4F7FB" stroke="#D9E2EC" stroke-width="2"/><rect x="${left}" y="${top}" width="${timeCol}" height="${bottom-top}" fill="#EAF2FA"/><line x1="${left+timeCol}" y1="${top}" x2="${left+timeCol}" y2="${bottom}" stroke="#D9E2EC" stroke-width="2"/>`;
  for (let r = 0; r <= rows; r++) {
    const y = top + r * rowH; body += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#D9E2EC" stroke-width="2"/>`;
    if (r < rows) body += `<text x="${left+timeCol/2}" y="${y+rowH/2+8}" class="navy" font-size="25" font-weight="700" text-anchor="middle">${String(minHour+r).padStart(2,"0")}:00</text>`;
  }
  for (const session of term.sessions.filter((s) => s.day === selection.day)) {
    const subj = term.subjects[session.subject], y1 = top + ((parseMinutes(session.start)-minHour*60)/60)*rowH+7, y2 = top + ((parseMinutes(session.end)-minHour*60)/60)*rowH-7, x1 = left+timeCol+12, x2 = right-12;
    body += `<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="22" fill="${subj.fill}" stroke="${subj.accent}" stroke-width="3"/>`;
    const lines = wrapWords(subj.name); let ty = (y1+y2)/2 - (lines.length === 2 ? 25 : 6);
    lines.forEach((line, i) => body += `<text x="${x1+28}" y="${ty+i*38}" fill="${subj.accent}" font-size="30" font-weight="700">${esc(line)}</text>`);
    body += `<text x="${x1+28}" y="${ty+lines.length*38+22}" class="ink" font-size="20">${esc(session.start)}–${esc(session.end)} · ${esc(subj.group)} · ${esc(subj.room)}</text>`;
  }
  return svgDoc(1080, 2160, body, "#fff");
}

function svgWeek(selection) {
  const { year, term } = lookup(selection); if (!year || !term) return svgVacations();
  const [minHour, maxHour] = hourBounds(term), left=72, top=285, right=1528, bottom=890, timeCol=118, head=54;
  const dayW=(right-left-timeCol)/5, rows=maxHour-minHour, rowH=(bottom-top-head)/rows;
  let body=`<text x="72" y="82" class="navy" font-size="30" font-weight="700">UCM · FdI</text><text x="1528" y="82" class="muted" font-size="22" font-weight="700" text-anchor="end">${esc(year.displayName)}</text><text x="72" y="195" class="ink" font-size="50" font-weight="700">Horario · ${esc(term.displayName)}</text><text x="72" y="235" class="muted" font-size="25">${esc(term.subtitle)}</text><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="18" fill="#fff" stroke="#D9E2EC" stroke-width="2"/><rect x="${left}" y="${top}" width="${right-left}" height="${head}" rx="18" fill="#173F68"/><text x="${left+timeCol/2}" y="${top+35}" fill="#fff" font-size="20" font-weight="700" text-anchor="middle">Hora</text>`;
  DAY_ORDER.forEach((day,i)=>body+=`<text x="${left+timeCol+dayW*(i+.5)}" y="${top+35}" fill="#fff" font-size="20" font-weight="700" text-anchor="middle">${DAY_ES[day]}</text>`);
  for(let i=0;i<=5;i++){const x=left+timeCol+i*dayW;body+=`<line x1="${x}" y1="${top+head}" x2="${x}" y2="${bottom}" stroke="#D9E2EC" stroke-width="2"/>`;}
  for(let r=0;r<=rows;r++){const y=top+head+r*rowH;body+=`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#D9E2EC" stroke-width="2"/>`;if(r<rows)body+=`<text x="${left+timeCol/2}" y="${y+rowH/2+6}" class="muted" font-size="18" font-weight="700" text-anchor="middle">${String(minHour+r).padStart(2,"0")}:00</text>`;}
  const dayIndex=Object.fromEntries(DAY_ORDER.map((d,i)=>[d,i]));
  for(const session of term.sessions){const subj=term.subjects[session.subject],col=dayIndex[session.day],y1=top+head+((parseMinutes(session.start)-minHour*60)/60)*rowH+4,y2=top+head+((parseMinutes(session.end)-minHour*60)/60)*rowH-4,x1=left+timeCol+col*dayW+5,x2=left+timeCol+(col+1)*dayW-5,cy=(y1+y2)/2,meta=subj.group==="3ºA"?subj.room:`${subj.group} · ${subj.room}`;body+=`<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="12" fill="${subj.fill}" stroke="${subj.accent}" stroke-width="2"/><text x="${(x1+x2)/2}" y="${cy-3}" fill="${subj.accent}" font-size="15" font-weight="700" text-anchor="middle">${esc(subj.short)}</text><text x="${(x1+x2)/2}" y="${cy+18}" class="ink" font-size="10" text-anchor="middle">${esc(meta)}</text>`;}
  return svgDoc(1600,1000,body);
}

function selectionSvg(selection) {
  if (selection.kind === "no-class") return svgNoClass();
  if (selection.kind === "vacations") return svgVacations();
  if (selection.kind === "day") return svgDay(selection);
  return svgWeek(selection);
}

function useSvgFallback() {
  if (!currentSelection || image.dataset.fallback === "1") return showError(new Error("No se pudo cargar ni regenerar el horario."));
  image.dataset.fallback = "1";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(selectionSvg(currentSelection))}`;
}

function render() {
  const date = getRequestedDate();
  const selection = selectScheduleAsset(config, { date, portraitNarrow: isPortraitNarrow() });
  if (!selection.path) throw new Error(`No se ha podido resolver un asset para ${date}.`);
  const url = resolveAssetUrl(selection.path);
  currentSelection = selection;
  document.documentElement.dataset.view = selection.kind;
  document.title = selection.kind === "day" ? `Horario · ${date}` : "Horario UCM";
  image.alt = selection.alt; image.hidden = false; errorBox.hidden = true;
  if (currentPath !== url) { currentPath = url; delete image.dataset.fallback; image.src = url; }
}

function showError(error) {
  console.error(error); image.hidden = true; errorBox.hidden = false;
  errorBox.textContent = "No he podido cargar el horario. Revisa la configuración o vuelve a intentarlo.";
}

async function init() {
  try {
    const response = await fetch("./config/schedules.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Error cargando configuración: ${response.status}`);
    config = await response.json();
    image.addEventListener("error", useSvgFallback);
    render();
    window.addEventListener("resize", () => { window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => { try { render(); } catch (error) { showError(error); } }, 100); });
  } catch (error) { showError(error); }
}

init();
