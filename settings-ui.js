import { collectAssetIds, USER_IMAGE_MIME_TYPES, WEEKDAYS } from "./config-schema.js";
import { activeWeekdaysForPeriod, monthOccurrences, weekOccurrences } from "./calendar-core.js";
import { addDays, inRange } from "./date-core.js";
import { getAsset, listAssets } from "./local-store.js";
import { initSettingsMotion } from "./settings-motion.js";
import { initSettingsGestures } from "./settings-gestures.js";

const DAY_LABELS = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
const UNIT_LABELS = { day: "Day", week: "Week", month: "Month" };
const IMAGE_LIMIT = 25 * 1024 * 1024;
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.avif,.gif,image/png,image/jpeg,image/webp,image/avif,image/gif";
const TOUCH_CONTROL_HIDE_DELAY = 4200;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "selected") node.selected = Boolean(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function clone(value) { return structuredClone(value); }
function safeFileName(value) {
  return String(value || "schedule-viewer").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "schedule-viewer";
}
function requestFile(accept) {
  return new Promise(resolve => {
    const input = el("input", { type: "file", accept });
    input.hidden = true;
    const finish = value => { input.remove(); resolve(value); };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = el("a", { href: url, download: filename });
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function downloadText(text, filename) { downloadBlob(new Blob([text], { type: "text/yaml;charset=utf-8" }), filename); }
function uniqueId(prefix) { return `${prefix}-${crypto.randomUUID().slice(0, 8)}`; }
function intersects(item, period) { return item.date ? inRange(item.date, period.start, period.end) : item.start <= period.end && period.start <= item.end; }
function formatDate(value) {
  try { return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
  catch { return value; }
}
function formatRange(start, end) { return `${formatDate(start)} – ${formatDate(end)}`; }
function field(label, control) { return el("label", { class: "settings-form-row" }, el("span", { text: label }), control); }
function select(options, value, label) {
  const node = el("select", { class: "settings-select", "aria-label": label });
  for (const [key, text] of options) node.append(el("option", { value: key, text, selected: key === value }));
  return node;
}

export function imagePeriods(config) {
  return (config.periods ?? []).map(period => ({ key: period.id, label: `${period.name} · ${formatRange(period.start, period.end)}`, period }));
}
export const imageTerms = imagePeriods;

function target({ key, label, group, note = "", fallback = "Uses the default image", get, set, remove = null, required = false }) {
  return { key, label, group, note, fallback, get, set, remove, required };
}

export function imageTargets(config, periodId = null) {
  const period = (config.periods ?? []).find(item => item.id === periodId) ?? config.periods?.[0];
  if (!period) return [];
  const vertical = period.images.active.vertical;
  const unit = config.presentation.vertical.unit;
  const result = [
    target({ key: `${period.id}:active:vertical:default`, label: "Default portrait", group: "Active days", note: "Used when no more specific image exists.", required: true, get: () => vertical.default, set: value => { vertical.default = value; } }),
    target({ key: `${period.id}:active:horizontal`, label: "Landscape", group: "Active days", note: "One landscape image for the entire period.", required: true, get: () => period.images.active.horizontal, set: value => { period.images.active.horizontal = value; } })
  ];
  const addMapTarget = (map, key, label, note = "") => result.push(target({
    key: `${period.id}:active:${unit}:${key}`, label, group: `Portrait · ${UNIT_LABELS[unit]}`, note,
    get: () => map[key], set: value => { map[key] = value; }, remove: () => { delete map[key]; }
  }));
  if (unit === "day") {
    const effectiveActiveDays = new Set(activeWeekdaysForPeriod(config, period));
    for (const day of WEEKDAYS.filter(day => effectiveActiveDays.has(day))) addMapTarget(vertical.days, day, DAY_LABELS[day]);
  } else if (unit === "week") {
    for (const occurrence of weekOccurrences(period, config.defaults.weekStartsOn)) addMapTarget(vertical.weeks, occurrence.key, formatRange(occurrence.start, occurrence.end), occurrence.partial ? "Partial week" : "");
  } else {
    for (const occurrence of monthOccurrences(period)) addMapTarget(vertical.months, occurrence.key, new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${occurrence.key}-01T00:00:00Z`)));
  }

  result.push(
    target({ key: `${period.id}:inactive:vertical`, label: "Default portrait", group: "Inactive days", required: true, get: () => period.images.inactive.vertical, set: value => { period.images.inactive.vertical = value; } }),
    target({ key: `${period.id}:inactive:horizontal`, label: "Default landscape", group: "Inactive days", required: true, get: () => period.images.inactive.horizontal, set: value => { period.images.inactive.horizontal = value; } })
  );
  for (const day of WEEKDAYS.filter(day => !config.calendar.activeWeekdays.includes(day))) {
    result.push(target({ key: `${period.id}:inactive:weekday:${day}`, label: DAY_LABELS[day], group: "Recurring inactive days", get: () => period.images.inactive.weekdays[day], set: value => { period.images.inactive.weekdays[day] = value; }, remove: () => { delete period.images.inactive.weekdays[day]; } }));
  }
  const addOrientationOverrides = (entry, prefix, group, note) => {
    for (const orientation of ["vertical", "horizontal"]) result.push(target({
      key: `${prefix}:${orientation}`, label: `${entry.name} · ${orientation === "vertical" ? "Portrait" : "Landscape"}`, group, note,
      get: () => entry.images?.[orientation], set: value => { entry.images ??= {}; entry.images[orientation] = value; }, remove: () => { delete entry.images?.[orientation]; }
    }));
  };
  for (const entry of config.calendar.exceptions.filter(item => item.state === "inactive" && intersects(item, period))) addOrientationOverrides(entry, `exception:${entry.id}`, "Exceptions", formatDate(entry.date));
  for (const entry of config.calendar.inactivePeriods.filter(item => intersects(item, period))) addOrientationOverrides(entry, `interval:${entry.id}`, "Inactive periods", formatRange(entry.start, entry.end));
  return result;
}

export function initSettingsUI({ deviceMode, getState, applyLocalConfig, resetToDemo, exportLegacyConfig = null, onUpdateSafetyChange = () => {} }) {
  const button = document.querySelector("#settings-button");
  const hint = document.querySelector("#demo-hint");
  const dialog = document.querySelector("#settings-dialog");
  const saveButton = document.querySelector("#settings-save");
  const status = document.querySelector("#settings-status");
  const sourceBadge = document.querySelector("#settings-source");
  const periodHost = document.querySelector("#period-settings");
  const calendarHost = document.querySelector("#calendar-settings");
  const presentationHost = document.querySelector("#presentation-settings");
  const imageOptions = document.querySelector("#image-options");
  const imageHost = document.querySelector("#image-settings");
  const imageDescription = document.querySelector("#image-settings-description");
  const yamlHost = document.querySelector("#yaml-editor-host");
  const yamlApply = document.querySelector("#yaml-apply");
  const yamlStatus = document.querySelector("#yaml-status");
  const yamlFileStatus = document.querySelector("#yaml-file-status");

  let workingConfig;
  let pendingAssets = new Map();
  let selectedPeriodId = null;
  let dirty = false;
  let pendingTasks = 0;
  let openingSettings = false;
  let yamlEditor = null;
  let savedYaml = null;
  let pendingFocusRestore = null;
  let motion;
  let controlHideTimer = null;
  let hintDismissed = false;
  const previewUrls = new Set();

  const clearControlHideTimer = () => {
    window.clearTimeout(controlHideTimer);
    controlHideTimer = null;
  };
  const hideFloatingControls = () => {
    controlHideTimer = null;
    if (dialog.open || button === document.activeElement || hint === document.activeElement) return;
    button.classList.add("is-hidden");
    hint.classList.add("is-hidden");
  };
  const scheduleFloatingControlsHide = () => {
    clearControlHideTimer();
    if (deviceMode !== "touch" || dialog.open) return;
    controlHideTimer = window.setTimeout(hideFloatingControls, TOUCH_CONTROL_HIDE_DELAY);
  };
  const revealFloatingControls = () => {
    if (dialog.open) return;
    button.classList.remove("is-hidden");
    if (!hint.hidden && !hintDismissed) hint.classList.remove("is-hidden");
    scheduleFloatingControlsHide();
  };
  const dismissHint = () => {
    hintDismissed = true;
    hint.classList.add("is-hidden");
  };

  const clearPreviews = () => { for (const url of previewUrls) URL.revokeObjectURL(url); previewUrls.clear(); };
  const setStatus = (message = "", kind = "info") => {
    status.textContent = message;
    status.dataset.kind = kind;
    saveButton.hidden = !dirty;
    dialog.querySelector(".settings-footer").hidden = !dirty && !message;
  };
  const markDirty = () => { dirty = true; saveButton.disabled = false; setStatus("Unsaved changes."); };
  const syncInert = () => { dialog.querySelector(".settings-scroll").inert = pendingTasks > 0 || ["opening", "closing", "dismissing"].includes(motion?.state); };
  const flushFocus = () => {
    if (!pendingFocusRestore || pendingTasks || dialog.dataset.panel !== pendingFocusRestore.panel) return;
    const request = pendingFocusRestore; pendingFocusRestore = null;
    requestAnimationFrame(() => request.element?.focus({ preventScroll: true }));
  };
  const runTask = callback => async (...args) => {
    if (pendingTasks) return;
    pendingTasks += 1; syncInert(); dialog.querySelector(".settings-scroll").setAttribute("aria-busy", "true");
    try { return await callback(...args); }
    catch (error) { setStatus(error.message, "error"); }
    finally { pendingTasks -= 1; syncInert(); dialog.querySelector(".settings-scroll").removeAttribute("aria-busy"); flushFocus(); onUpdateSafetyChange(); }
  };

  async function previewFor(descriptor, img) {
    if (!descriptor) return;
    if (descriptor.src) { img.src = new URL(descriptor.src, document.baseURI).href; return; }
    let record = pendingAssets.get(descriptor.asset);
    if (!record) {
      record = await getAsset(descriptor.asset);
      if (!img.isConnected) return;
    }
    if (!record?.blob) return;
    const url = URL.createObjectURL(record.blob); previewUrls.add(url); img.src = url;
  }
  function supportedFile(file) {
    if (file.size > IMAGE_LIMIT) throw new Error("The image exceeds the 25 MiB limit.");
    const extensionOk = /\.(?:png|jpe?g|webp|avif|gif)$/i.test(file.name);
    if (!USER_IMAGE_MIME_TYPES.has(file.type) || !extensionOk) throw new Error("Only PNG, JPEG, WebP, AVIF and GIF are supported. SVG is not allowed.");
  }
  const chooseImage = runTask(async target => {
    const file = await requestFile(IMAGE_ACCEPT);
    if (!file) return;
    supportedFile(file);
    const id = `asset-${crypto.randomUUID()}`;
    pendingAssets.set(id, { id, blob: file, mimeType: file.type, filename: file.name });
    target.set({ type: "image", asset: id, alt: target.label, fit: target.get()?.fit ?? "contain" });
    markDirty(); renderImages();
  });

  function renderPeriods() {
    periodHost.replaceChildren();
    const list = el("div", { class: "settings-form-list" });
    workingConfig.periods.forEach((period, index) => {
      const name = el("input", { class: "settings-text", value: period.name, "aria-label": "Period name" });
      const start = el("input", { class: "settings-date", type: "date", value: period.start });
      const end = el("input", { class: "settings-date", type: "date", value: period.end });
      name.addEventListener("input", () => { period.name = name.value; markDirty(); });
      start.addEventListener("change", () => { period.start = start.value; markDirty(); renderImages(); });
      end.addEventListener("change", () => { period.end = end.value; markDirty(); renderImages(); });
      const card = el("section", { class: "settings-card period-card" }, el("h3", { text: `Period ${index + 1}` }), field("Name", name), field("Start", start), field("End", end));
      if (workingConfig.periods.length > 1) card.append(el("button", { type: "button", class: "danger-button inline-danger", text: "Delete period", onclick: () => {
        if (!confirm(`Delete ${period.name} and its configured images?`)) return;
        workingConfig.periods.splice(index, 1); selectedPeriodId = workingConfig.periods[0]?.id ?? null; markDirty(); renderAll();
      } }));
      list.append(card);
    });
    const add = el("button", { type: "button", class: "settings-add-row", text: "+  Add period", onclick: () => {
      const last = workingConfig.periods.at(-1);
      const start = addDays(last.end, 1), end = addDays(start, 90);
      workingConfig.periods.push({ id: uniqueId("period"), name: "New period", start, end, images: clone(last.images) });
      selectedPeriodId = workingConfig.periods.at(-1).id; markDirty(); renderAll();
    } });
    periodHost.append(list, add);
  }

  function renderCalendar() {
    calendarHost.replaceChildren();
    const weekdayCard = el("div", { class: "settings-card" });
    const weekdays = el("section", { class: "calendar-editor" }, el("h3", { class: "settings-section-heading", text: "Weekly pattern" }), weekdayCard);
    for (const day of WEEKDAYS) {
      const checkbox = el("input", { type: "checkbox", checked: workingConfig.calendar.activeWeekdays.includes(day) });
      checkbox.addEventListener("change", () => {
        const set = new Set(workingConfig.calendar.activeWeekdays);
        checkbox.checked ? set.add(day) : set.delete(day);
        if (!set.size) { checkbox.checked = true; return setStatus("At least one day must remain active.", "error"); }
        workingConfig.calendar.activeWeekdays = WEEKDAYS.filter(item => set.has(item)); markDirty(); renderImages();
      });
      weekdayCard.append(el("label", { class: "checkbox-row" }, el("span", { text: DAY_LABELS[day] }), checkbox));
    }
    const exceptions = el("section", { class: "calendar-editor" }, el("h3", { class: "settings-section-heading", text: "Exceptions" }));
    workingConfig.calendar.exceptions.forEach((entry, index) => {
      const date = el("input", { class: "settings-date", type: "date", value: entry.date });
      const name = el("input", { class: "settings-text", value: entry.name });
      const state = select([["active", "Active"], ["inactive", "Inactive"]], entry.state, "State");
      const kind = select([["holiday", "Holiday"], ["closure", "Closure"], ["other", "Other"]], entry.kind, "Category");
      date.onchange = () => { entry.date = date.value; markDirty(); renderImages(); };
      name.oninput = () => { entry.name = name.value; markDirty(); };
      state.onchange = () => { entry.state = state.value; if (entry.state === "active") entry.images = {}; markDirty(); renderCalendar(); renderImages(); };
      kind.onchange = () => { entry.kind = kind.value; markDirty(); };
      exceptions.append(el("div", { class: "settings-card calendar-item" }, field("Date", date), field("Name", name), field("State", state), field("Category", kind), el("button", { type: "button", class: "danger-button inline-danger", text: "Delete", onclick: () => { workingConfig.calendar.exceptions.splice(index, 1); markDirty(); renderCalendar(); renderImages(); } })));
    });
    exceptions.append(el("button", { type: "button", class: "settings-add-row", text: "+  Add exception", onclick: () => { workingConfig.calendar.exceptions.push({ id: uniqueId("exception"), date: workingConfig.periods[0].start, name: "New exception", state: "inactive", kind: "other", images: {} }); markDirty(); renderCalendar(); } }));
    const intervals = el("section", { class: "calendar-editor" }, el("h3", { class: "settings-section-heading", text: "Inactive periods" }));
    workingConfig.calendar.inactivePeriods.forEach((entry, index) => {
      const name = el("input", { class: "settings-text", value: entry.name });
      const start = el("input", { class: "settings-date", type: "date", value: entry.start });
      const end = el("input", { class: "settings-date", type: "date", value: entry.end });
      const kind = select([["vacation", "Vacation"], ["closure", "Closure"], ["other", "Other"]], entry.kind, "Category");
      name.oninput = () => { entry.name = name.value; markDirty(); };
      start.onchange = () => { entry.start = start.value; markDirty(); renderImages(); };
      end.onchange = () => { entry.end = end.value; markDirty(); renderImages(); };
      kind.onchange = () => { entry.kind = kind.value; markDirty(); };
      intervals.append(el("div", { class: "settings-card calendar-item" }, field("Name", name), field("Start", start), field("End", end), field("Category", kind), el("button", { type: "button", class: "danger-button inline-danger", text: "Delete", onclick: () => { workingConfig.calendar.inactivePeriods.splice(index, 1); markDirty(); renderCalendar(); renderImages(); } })));
    });
    intervals.append(el("button", { type: "button", class: "settings-add-row", text: "+  Add inactive period", onclick: () => { const first = workingConfig.periods[0]; workingConfig.calendar.inactivePeriods.push({ id: uniqueId("inactive"), name: "New inactive period", start: first.start, end: first.start, kind: "other", images: {} }); markDirty(); renderCalendar(); } }));
    calendarHost.append(weekdays, exceptions, intervals);
  }

  function renderPresentation() {
    presentationHost.replaceChildren();
    const unit = select([["day", "Day"], ["week", "Week"], ["month", "Month"]], workingConfig.presentation.vertical.unit, "Portrait presentation");
    unit.onchange = () => { workingConfig.presentation.vertical.unit = unit.value; markDirty(); renderImages(); };
    const card = el("section", { class: "settings-card presentation-list" }, field("Portrait", unit), el("div", { class: "settings-summary-row" }, el("span", { text: "Landscape" }), el("span", { class: "settings-value", text: "Fixed image per period" })));
    if (deviceMode === "desktop") {
      const toggle = el("input", { type: "checkbox", checked: workingConfig.presentation.desktopToggle });
      toggle.onchange = () => { workingConfig.presentation.desktopToggle = toggle.checked; markDirty(); };
      card.append(el("label", { class: "switch-row" }, el("span", { text: "Switch views with Space" }), toggle));
      presentationHost.append(card);
      return;
    }
    presentationHost.append(card, el("p", { class: "settings-group-note", text: "Portrait shows the portrait view; landscape shows the landscape view." }));
  }

  function renderImageRow(item) {
    const descriptor = item.get();
    const preview = el("img", { class: `image-preview${descriptor ? "" : " empty"}`, alt: "" });
    const main = el("button", { type: "button", class: "image-setting-main", "aria-label": `${descriptor ? "Change" : "Choose"} ${item.label}`, onclick: () => chooseImage(item) }, preview, el("span", { class: "image-setting-copy" }, el("strong", { text: item.label }), el("small", { text: descriptor ? (descriptor.asset ? "Saved on this device" : "Included in the configuration") : item.fallback }), item.note ? el("small", { text: item.note }) : null), el("span", { class: "settings-chevron", text: "›", "aria-hidden": "true" }));
    const row = el("div", { class: "image-setting", "data-image-key": item.key }, main);
    if (descriptor && item.remove && !item.required) {
      const more = el("details", { class: "image-more" }, el("summary", { "aria-label": `More actions for ${item.label}`, text: "•••" }), el("div", { class: "image-more-menu" }, el("button", { type: "button", text: "Change", onclick: () => chooseImage(item) }), el("button", { type: "button", class: "danger", text: "Remove", onclick: () => { item.remove(); markDirty(); renderImages(); } })));
      row.append(more);
    }
    if (descriptor) previewFor(descriptor, preview).catch(() => {});
    return row;
  }

  function renderImages() {
    if (!workingConfig) return;
    clearPreviews(); imageOptions.replaceChildren(); imageHost.replaceChildren();
    const periods = imagePeriods(workingConfig);
    if (!periods.some(item => item.key === selectedPeriodId)) selectedPeriodId = periods[0]?.key ?? null;
    const picker = select(periods.map(item => [item.key, item.label]), selectedPeriodId, "Period");
    picker.id = "image-period";
    picker.onchange = () => { selectedPeriodId = picker.value; renderImages(); };
    imageOptions.append(field("Period", picker));
    imageDescription.textContent = `Portrait uses ${UNIT_LABELS[workingConfig.presentation.vertical.unit].toLowerCase()} and can vary with the calendar. Landscape uses one fixed image for the period.`;
    const targets = imageTargets(workingConfig, selectedPeriodId);
    for (const groupName of [...new Set(targets.map(item => item.group))]) {
      const details = el("details", { class: "image-settings-group", open: ["Active days", `Portrait · ${UNIT_LABELS[workingConfig.presentation.vertical.unit]}`, "Inactive days"].includes(groupName) }, el("summary", { text: groupName }));
      for (const item of targets.filter(target => target.group === groupName)) details.append(renderImageRow(item));
      imageHost.append(details);
    }
  }

  function renderLegacyWarning() {
    const warning = document.querySelector("#legacy-config-warning");
    const issue = getState().legacyIssue;
    warning.hidden = !issue;
    if (!issue) return;
    warning.replaceChildren(el("h3", { text: "Incompatible legacy configuration" }), el("p", { text: issue }), exportLegacyConfig ? el("button", { type: "button", class: "secondary-button", text: "Download legacy backup", onclick: runTask(async () => downloadBlob(await exportLegacyConfig(), "schedule-viewer-v3-legacy.zip")) }) : null, el("button", { type: "button", class: "secondary-button", text: "Import v4 configuration", onclick: () => motion.showPanel("backup") }));
  }

  function renderAll() { renderPeriods(); renderCalendar(); renderPresentation(); renderImages(); renderLegacyWarning(); }
  const loadIo = async () => { const module = await import("./lazy/config-io.js"); document.documentElement.dataset.configIoLoaded = "1"; return module; };
  const missingAssets = async config => {
    const ids = new Set((await listAssets()).map(item => item.id)); for (const id of pendingAssets.keys()) ids.add(id);
    return collectAssetIds(config).filter(id => !ids.has(id));
  };
  const resolveMissing = async (config, node = status) => {
    for (const id of await missingAssets(config)) {
      node.textContent = `Select the image for ${id}.`;
      const file = await requestFile(IMAGE_ACCEPT); if (!file) return false; supportedFile(file);
      pendingAssets.set(id, { id, blob: file, mimeType: file.type, filename: file.name });
    }
    return true;
  };

  const saveWorking = runTask(async ({ yaml = null } = {}) => {
    saveButton.disabled = true; setStatus("Validating and saving…");
    const io = await loadIo(); const normalized = io.normalizeCompiledConfig(workingConfig);
    if (!await resolveMissing(normalized)) throw new Error("Required local images are missing.");
    const yamlText = yaml ?? io.compiledToYaml(normalized);
    await applyLocalConfig(normalized, { yaml: yamlText, assets: [...pendingAssets.values()] });
    workingConfig = clone(normalized); pendingAssets = new Map(); dirty = false; setStatus("Saved on this device.", "success"); syncSource(); renderAll();
  });

  const syncSource = () => {
    const state = getState();
    sourceBadge.textContent = state.source === "demo" ? "Demo configuration" : "Local configuration";
    hint.hidden = state.source !== "demo";
    if (hint.hidden || hintDismissed) hint.classList.add("is-hidden");
    renderLegacyWarning();
  };
  const refreshDraft = () => { workingConfig = clone(getState().config); pendingAssets = new Map(); dirty = false; saveButton.disabled = true; setStatus(); renderAll(); };

  motion = initSettingsMotion({ dialog, deviceMode, onStateChange: () => { syncInert(); onUpdateSafetyChange(); } });
  const openSettings = async (panel = "home", { refresh } = {}) => {
    const shouldRefresh = refresh ?? (!dialog.open && !openingSettings);
    if ((dialog.open || openingSettings) && !shouldRefresh) return panel === dialog.dataset.panel ? motion.open(panel) : motion.showPanel(panel);
    openingSettings = true; clearControlHideTimer(); dismissHint(); refreshDraft();
    try { await motion.showPanel(panel, { instant: true }); await motion.open(panel); button.classList.remove("is-hidden"); }
    finally { openingSettings = false; }
  };
  const closeSettings = async ({ velocity = 0 } = {}) => {
    if (pendingTasks) { if (motion.state === "dismissing") await motion.cancelDismiss(); setStatus("Wait for the current operation to finish."); return false; }
    const yamlDirty = yamlEditor && yamlEditor.getValue() !== savedYaml;
    if ((dirty || yamlDirty) && !confirm("There are unsaved changes. Discard them and close Settings?")) { if (motion.state === "dismissing") await motion.cancelDismiss({ velocity: -velocity }); return false; }
    if (!await motion.close({ velocity: dirty || yamlDirty ? 0 : velocity })) return false;
    dirty = false; if (yamlEditor) { yamlEditor.destroy(); yamlEditor = null; yamlHost.replaceChildren(); document.documentElement.dataset.yamlEditorLoaded = "0"; }
    clearPreviews(); revealFloatingControls(); onUpdateSafetyChange(); return true;
  };
  initSettingsGestures({ dialog, motion, deviceMode, isBusy: () => pendingTasks > 0, onDismissRequested: closeSettings });

  button.onclick = () => void openSettings();
  hint.onclick = () => void openSettings();
  document.querySelector("#settings-close").onclick = () => void closeSettings();
  document.querySelector("#settings-back").onclick = () => {
    const previous = dialog.dataset.panel; const parent = previous === "yaml" ? "advanced" : "home";
    void motion.showPanel(parent).then(done => { if (done) { pendingFocusRestore = { panel: parent, element: previous === "yaml" ? document.querySelector("#yaml-edit") : dialog.querySelector(`[data-settings-tab="${previous}"]`) }; flushFocus(); } });
  };
  for (const tab of dialog.querySelectorAll("[data-settings-tab]")) tab.onclick = () => void motion.showPanel(tab.dataset.settingsTab);
  saveButton.onclick = () => saveWorking();
  dialog.addEventListener("click", event => { if (event.target === dialog) void closeSettings(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); void closeSettings(); });

  const onDocumentPress = event => {
    if (!(event.target instanceof Node)) return;
    if (button.contains(event.target) || hint.contains(event.target) || dialog.contains(event.target)) return;
    if (deviceMode === "touch") revealFloatingControls();
    else dismissHint();
  };
  document.addEventListener("pointerdown", onDocumentPress, { capture: true, passive: true });
  document.addEventListener("touchstart", onDocumentPress, { capture: true, passive: true });
  button.addEventListener("focus", clearControlHideTimer);
  hint.addEventListener("focus", clearControlHideTimer);
  button.addEventListener("blur", scheduleFloatingControlsHide);
  hint.addEventListener("blur", scheduleFloatingControlsHide);

  document.querySelector("#backup-export").onclick = runTask(async () => { const io = await loadIo(); const state = getState(); downloadBlob(await io.exportSchedulePackage({ config: state.config, assets: await listAssets() }), `${safeFileName(state.config.periods?.[0]?.name)}.schedule`); setStatus("Backup exported.", "success"); });
  document.querySelector("#backup-import").onclick = runTask(async () => { const file = await requestFile(".schedule,application/zip,application/vnd.schedule-viewer+zip"); if (!file) return; const io = await loadIo(); const imported = await io.inspectSchedulePackage(file); await applyLocalConfig(imported.config, { yaml: imported.yaml, assets: imported.assets }); setStatus("Configuration restored.", "success"); syncSource(); await openSettings("backup", { refresh: true }); });
  document.querySelector("#backup-reset").onclick = runTask(async () => { if (!confirm("Restore the demo and delete local assets?")) return; await resetToDemo(); setStatus("Demo restored.", "success"); await openSettings("home", { refresh: true }); });
  document.querySelector("#yaml-export").onclick = runTask(async () => { const io = await loadIo(); const state = getState(); downloadText(io.compiledToYaml(state.config), `${safeFileName(state.config.periods?.[0]?.name)}.yaml`); yamlFileStatus.textContent = "YAML exported."; });
  document.querySelector("#yaml-import").onclick = runTask(async () => { const file = await requestFile(".yaml,.yml,text/yaml,text/plain"); if (!file) return; const text = await file.text(); const io = await loadIo(); const config = io.yamlToCompiled(text); pendingAssets = new Map(); if (!await resolveMissing(config, yamlFileStatus)) return; await applyLocalConfig(config, { yaml: text, assets: [...pendingAssets.values()] }); refreshDraft(); yamlFileStatus.textContent = "YAML v4 imported and applied."; });
  document.querySelector("#yaml-edit").onclick = runTask(async () => {
    await motion.showPanel("yaml"); if (yamlEditor) return yamlEditor.focus(); yamlStatus.textContent = "Loading editor…";
    const state = getState(); const io = await loadIo(); savedYaml = state.yaml || io.compiledToYaml(state.config);
    const editor = await import("./lazy/yaml-editor.js"); document.documentElement.dataset.yamlEditorLoaded = "1";
    yamlEditor = editor.mountYamlEditor(yamlHost, { initialValue: savedYaml, onValidityChange(result) { yamlApply.disabled = !result.valid; yamlStatus.textContent = result.valid ? "Valid YAML v4." : result.diagnostics[0]?.message ?? "Invalid YAML."; } });
    yamlHost.hidden = false; yamlApply.disabled = !yamlEditor.lastResult.valid; yamlEditor.focus();
  });
  yamlApply.onclick = runTask(async () => { if (!yamlEditor) return; const result = yamlEditor.validate(); if (!result.valid) return; pendingAssets = new Map(); if (!await resolveMissing(result.config, yamlStatus)) return; await applyLocalConfig(result.config, { yaml: yamlEditor.getValue(), assets: [...pendingAssets.values()] }); refreshDraft(); savedYaml = yamlEditor.getValue(); yamlStatus.textContent = "YAML applied and saved."; });

  document.addEventListener("keydown", event => { if (event.key === "," && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) { event.preventDefault(); void openSettings(); } });
  syncSource();
  revealFloatingControls();
  return { openSettings, closeSettings, syncState: syncSource, isOpen: () => dialog.open, motion, isSafeToReload: () => !openingSettings && !dialog.open && pendingTasks === 0 && !motion.transitioning };
}
