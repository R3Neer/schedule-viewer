import { collectAssetIds, RANGE_TYPES, WEEKDAYS } from "./config-schema.js";
import { getAsset, listAssets } from "./local-store.js";

const DAY_LABELS = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo"
};
const RANGE_LABELS = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  year: "Año",
  relative: "Ventana relativa",
  rolling: "Ventana de N días",
  interval: "Intervalo personalizado"
};
const IMAGE_LIMIT = 25 * 1024 * 1024;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function clone(value) {
  return structuredClone(value);
}

function safeFileName(value) {
  return String(value || "schedule")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "schedule";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadText(text, filename, type = "text/yaml;charset=utf-8") {
  downloadBlob(new Blob([text], { type }), filename);
}

function requestFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

function createRangeControl(label, config, viewId, onDirty) {
  const view = config.views?.[viewId];
  if (!view) return el("p", { class: "settings-note", text: `${label}: vista no disponible` });
  const wrapper = el("div", { class: "range-control", "data-view-id": viewId });
  wrapper.append(el("label", { class: "settings-row-label", text: label }));
  const select = el("select", { class: "settings-select", "aria-label": label });
  for (const type of RANGE_TYPES) {
    const option = el("option", { value: type, text: RANGE_LABELS[type] ?? type });
    if (view.range?.type === type) option.selected = true;
    select.append(option);
  }
  wrapper.append(select);
  const detail = el("div", { class: "range-detail" });
  wrapper.append(detail);

  const renderDetail = () => {
    detail.replaceChildren();
    const range = view.range ?? { type: "day" };
    if (range.type === "week") {
      const starts = el("select", { class: "settings-select compact", "aria-label": "Inicio de semana" });
      for (const day of WEEKDAYS) {
        const option = el("option", { value: day, text: DAY_LABELS[day] });
        if ((range.startsOn ?? config.defaults?.weekStartsOn ?? "monday") === day) option.selected = true;
        starts.append(option);
      }
      starts.addEventListener("change", () => { view.range.startsOn = starts.value; onDirty(); });
      detail.append(el("label", { class: "inline-field" }, el("span", { text: "Empieza" }), starts));
    } else if (range.type === "relative") {
      for (const [key, text] of [["before", "Días anteriores"], ["after", "Días posteriores"]]) {
        const input = el("input", { type: "number", min: "0", value: String(range[key] ?? 0), class: "settings-number" });
        input.addEventListener("change", () => { view.range[key] = Math.max(0, Number.parseInt(input.value || "0", 10)); onDirty(); });
        detail.append(el("label", { class: "inline-field" }, el("span", { text }), input));
      }
    } else if (range.type === "rolling") {
      const days = el("input", { type: "number", min: "1", value: String(range.days ?? 7), class: "settings-number" });
      const anchor = el("select", { class: "settings-select compact" });
      for (const [value, text] of [["start", "Inicio"], ["center", "Centro"], ["end", "Final"]]) {
        const option = el("option", { value, text });
        if ((range.anchorPosition ?? "start") === value) option.selected = true;
        anchor.append(option);
      }
      days.addEventListener("change", () => { view.range.days = Math.max(1, Number.parseInt(days.value || "1", 10)); onDirty(); });
      anchor.addEventListener("change", () => { view.range.anchorPosition = anchor.value; onDirty(); });
      detail.append(el("label", { class: "inline-field" }, el("span", { text: "Días" }), days));
      detail.append(el("label", { class: "inline-field" }, el("span", { text: "Fecha ancla" }), anchor));
    } else if (range.type === "interval") {
      for (const [key, text] of [["start", "Desde"], ["end", "Hasta"]]) {
        const input = el("input", { type: "date", value: range[key] ?? "2026-01-01", class: "settings-date" });
        input.addEventListener("change", () => { view.range[key] = input.value; onDirty(); });
        detail.append(el("label", { class: "inline-field" }, el("span", { text }), input));
      }
    }
  };

  select.addEventListener("change", () => {
    const type = select.value;
    if (type === "week") view.range = { type, startsOn: config.defaults?.weekStartsOn ?? "monday" };
    else if (type === "relative") view.range = { type, before: 0, after: 0 };
    else if (type === "rolling") view.range = { type, days: 7, anchorPosition: "start" };
    else if (type === "interval") view.range = { type, start: "2026-01-01", end: "2026-01-07" };
    else view.range = { type };
    onDirty();
    renderDetail();
  });
  renderDetail();
  return wrapper;
}

function touchViewId(config, orientation) {
  const views = Object.values(config.views ?? {});
  const ranked = views
    .filter((view) => !view.manualOnly && view.when?.orientation === orientation)
    .sort((a, b) => {
      const aCoarse = a.when?.pointer === "coarse" ? 1 : 0;
      const bCoarse = b.when?.pointer === "coarse" ? 1 : 0;
      return bCoarse - aCoarse || (b.priority ?? 0) - (a.priority ?? 0) || (a.order ?? 0) - (b.order ?? 0);
    });
  return ranked[0]?.id ?? null;
}

function imageTargets(config) {
  const result = [{
    key: "default",
    label: "Imagen por defecto",
    required: true,
    get: () => config.calendar.inactive.defaultImage,
    set: (value) => { config.calendar.inactive.defaultImage = value; },
    remove: null
  }];

  for (const [weekday, options] of Object.entries(config.calendar?.inactiveWeekdays ?? {})) {
    result.push({
      key: `weekday:${weekday}`,
      label: DAY_LABELS[weekday],
      required: false,
      get: () => options.image ?? null,
      set: (value) => { options.image = value; },
      remove: () => { delete options.image; }
    });
  }
  for (const year of config.academicYears ?? []) {
    for (const holiday of year.calendar?.holidays ?? []) {
      result.push({
        key: `holiday:${year.id}:${holiday.date}`,
        label: holiday.label || `Festivo ${holiday.date}`,
        required: false,
        get: () => holiday.image ?? null,
        set: (value) => { holiday.image = value; },
        remove: () => { delete holiday.image; }
      });
    }
    for (const day of year.calendar?.inactiveDates ?? []) {
      result.push({
        key: `inactive:${year.id}:${day.date}`,
        label: day.label || `Día inactivo ${day.date}`,
        required: false,
        get: () => day.image ?? null,
        set: (value) => { day.image = value; },
        remove: () => { delete day.image; }
      });
    }
    for (const period of year.calendar?.periods ?? []) {
      result.push({
        key: `period:${year.id}:${period.id}`,
        label: period.label || period.id,
        required: false,
        get: () => period.image ?? null,
        set: (value) => { period.image = value; },
        remove: () => { delete period.image; }
      });
    }
  }
  return result;
}

export function initSettingsUI({ deviceMode, getState, applyLocalConfig, resetToDemo }) {
  const button = document.querySelector("#settings-button");
  const hint = document.querySelector("#demo-hint");
  const dialog = document.querySelector("#settings-dialog");
  const closeButton = document.querySelector("#settings-close");
  const saveButton = document.querySelector("#settings-save");
  const sourceBadge = document.querySelector("#settings-source");
  const schedulePanel = document.querySelector("#settings-schedule-panel");
  const imagePanel = document.querySelector("#settings-images-panel");
  const backupPanel = document.querySelector("#settings-backup-panel");
  const advancedPanel = document.querySelector("#settings-advanced-panel");
  const viewContainer = document.querySelector("#view-settings");
  const inactiveContainer = document.querySelector("#inactive-settings");
  const imageContainer = document.querySelector("#image-settings");
  const settingsStatus = document.querySelector("#settings-status");
  const yamlHost = document.querySelector("#yaml-editor-host");
  const yamlValidate = document.querySelector("#yaml-validate");
  const yamlApply = document.querySelector("#yaml-apply");
  const yamlStatus = document.querySelector("#yaml-status");

  let workingConfig = null;
  let pendingAssets = new Map();
  let dirty = false;
  let hideTimer = null;
  let hintTimer = null;
  let yamlEditor = null;
  const previewUrls = new Set();

  const setStatus = (message, kind = "info") => {
    settingsStatus.textContent = message || "";
    settingsStatus.dataset.kind = kind;
  };

  const markDirty = () => {
    dirty = true;
    saveButton.disabled = false;
    setStatus("Cambios sin guardar.");
  };

  const clearPreviewUrls = () => {
    for (const url of previewUrls) URL.revokeObjectURL(url);
    previewUrls.clear();
  };

  const syncSourceUi = () => {
    const state = getState();
    const demo = state.source === "demo";
    sourceBadge.textContent = demo ? "Configuración demo" : "Configuración local";
    sourceBadge.dataset.source = demo ? "demo" : "local";
    hint.hidden = !demo;
    if (demo) {
      hint.classList.remove("is-hidden");
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => hint.classList.add("is-hidden"), 5200);
    }
  };

  const showControl = () => {
    button.classList.remove("is-hidden");
    if (deviceMode !== "touch" || dialog.open) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => button.classList.add("is-hidden"), 3600);
  };

  const renderViewSettings = () => {
    viewContainer.replaceChildren();
    const metadata = el("div", { class: "settings-card" });
    const titleInput = el("input", { value: workingConfig.app?.title ?? "Schedule Viewer", class: "settings-text" });
    const brandInput = el("input", { value: workingConfig.visual?.brand ?? "", class: "settings-text" });
    titleInput.addEventListener("input", () => { workingConfig.app.title = titleInput.value; markDirty(); });
    brandInput.addEventListener("input", () => { workingConfig.visual = workingConfig.visual ?? {}; workingConfig.visual.brand = brandInput.value; markDirty(); });
    metadata.append(el("label", { class: "stack-field" }, el("span", { text: "Nombre" }), titleInput));
    metadata.append(el("label", { class: "stack-field" }, el("span", { text: "Marca" }), brandInput));
    viewContainer.append(metadata);

    const card = el("div", { class: "settings-card" });
    card.append(el("h3", { text: "Vista" }));
    if (deviceMode === "touch") {
      const portrait = touchViewId(workingConfig, "portrait");
      const landscape = touchViewId(workingConfig, "landscape");
      if (portrait) card.append(createRangeControl("Vertical", workingConfig, portrait, markDirty));
      if (landscape) card.append(createRangeControl("Horizontal", workingConfig, landscape, markDirty));
      if (!portrait || !landscape) card.append(el("p", { class: "settings-note", text: "Esta configuración avanzada no define perfiles táctiles separados para ambas orientaciones." }));
    } else {
      card.append(createRangeControl("Principal", workingConfig, workingConfig.desktop.primaryView, markDirty));
      card.append(createRangeControl("Secundaria", workingConfig, workingConfig.desktop.secondaryView, markDirty));
      const toggle = el("input", { type: "checkbox" });
      toggle.checked = workingConfig.desktop?.shortcuts?.toggleView?.enabled !== false;
      toggle.addEventListener("change", () => {
        workingConfig.desktop.shortcuts.toggleView.enabled = toggle.checked;
        markDirty();
      });
      card.append(el("label", { class: "switch-row" }, el("span", { text: "Espacio para alternar" }), toggle));
    }
    viewContainer.append(card);
  };

  const renderInactiveSettings = () => {
    inactiveContainer.replaceChildren();
    const card = el("div", { class: "settings-card" });
    card.append(el("h3", { text: "Días inactivos" }));
    for (const weekday of WEEKDAYS) {
      const checkbox = el("input", { type: "checkbox", value: weekday });
      checkbox.checked = Boolean(workingConfig.calendar?.inactiveWeekdays?.[weekday]);
      checkbox.addEventListener("change", () => {
        workingConfig.calendar.inactiveWeekdays = workingConfig.calendar.inactiveWeekdays ?? {};
        if (checkbox.checked) workingConfig.calendar.inactiveWeekdays[weekday] = workingConfig.calendar.inactiveWeekdays[weekday] ?? {};
        else delete workingConfig.calendar.inactiveWeekdays[weekday];
        markDirty();
        renderImages();
      });
      card.append(el("label", { class: "checkbox-row" }, checkbox, el("span", { text: DAY_LABELS[weekday] })));
    }
    inactiveContainer.append(card);
  };

  async function previewFor(descriptor, img) {
    if (!descriptor) return;
    if (descriptor.src) {
      try { img.src = new URL(descriptor.src, document.baseURI).href; } catch { /* nada */ }
      return;
    }
    if (descriptor.asset) {
      const pending = pendingAssets.get(descriptor.asset);
      const record = pending ?? await getAsset(descriptor.asset);
      if (!record?.blob || !img.isConnected) return;
      const url = URL.createObjectURL(record.blob);
      previewUrls.add(url);
      img.src = url;
    }
  }

  const chooseImageFor = async (target) => {
    const file = await requestFile("image/*,.svg,.avif");
    if (!file) return;
    if (file.size > IMAGE_LIMIT) {
      setStatus("La imagen supera el límite de 25 MiB.", "error");
      return;
    }
    if (file.type && !file.type.startsWith("image/")) {
      setStatus("El archivo elegido no es una imagen reconocida.", "error");
      return;
    }
    const previous = target.get();
    const id = `asset-${crypto.randomUUID()}`;
    pendingAssets.set(id, { id, blob: file, mimeType: file.type, filename: file.name });
    target.set({ type: "image", asset: id, alt: previous?.alt ?? target.label, fit: previous?.fit ?? "contain" });
    markDirty();
    renderImages();
  };

  const renderImages = () => {
    clearPreviewUrls();
    imageContainer.replaceChildren();
    const groups = imageTargets(workingConfig);
    for (const target of groups) {
      const descriptor = target.get();
      const row = el("div", { class: "image-setting" });
      const preview = el("img", { class: "image-preview", alt: "" });
      if (!descriptor) preview.classList.add("empty");
      else previewFor(descriptor, preview).catch(() => {});
      const text = el("div", { class: "image-setting-copy" },
        el("strong", { text: target.label }),
        el("small", { text: descriptor ? (descriptor.asset ? "Imagen guardada en este dispositivo" : "Imagen incluida con la aplicación") : "Usa la imagen por defecto" })
      );
      const actions = el("div", { class: "image-setting-actions" });
      actions.append(el("button", { type: "button", class: "secondary-button", text: descriptor ? "Cambiar" : "Usar imagen específica", onclick: () => chooseImageFor(target) }));
      if (descriptor && !target.required && target.remove) {
        actions.append(el("button", { type: "button", class: "text-button danger", text: "Eliminar", onclick: () => { target.remove(); markDirty(); renderImages(); } }));
      }
      row.append(preview, text, actions);
      imageContainer.append(row);
    }
  };

  const loadConfigIo = async () => {
    const module = await import("./lazy/config-io.js");
    document.documentElement.dataset.configIoLoaded = "1";
    return module;
  };

  const existingAssetIds = async () => new Set((await listAssets()).map((item) => item.id));

  const missingAssetIds = async (config) => {
    const existing = await existingAssetIds();
    for (const id of pendingAssets.keys()) existing.add(id);
    return collectAssetIds(config).filter((id) => !existing.has(id));
  };

  const resolveMissingAssets = async (config) => {
    const missing = await missingAssetIds(config);
    if (!missing.length) return true;
    yamlStatus.textContent = `Faltan ${missing.length} imágenes: ${missing.join(", ")}.`;
    for (const id of missing) {
      const file = await requestFile("image/*,.svg,.avif");
      if (!file) return false;
      if (file.size > IMAGE_LIMIT || (file.type && !file.type.startsWith("image/"))) {
        yamlStatus.textContent = `El archivo para ${id} no es una imagen válida o supera 25 MiB.`;
        return false;
      }
      pendingAssets.set(id, { id, blob: file, mimeType: file.type, filename: file.name });
    }
    return true;
  };

  const saveWorking = async ({ yaml = null } = {}) => {
    try {
      saveButton.disabled = true;
      setStatus("Validando y guardando…");
      const io = await loadConfigIo();
      const normalized = io.normalizeCompiledConfig(workingConfig);
      if (!await resolveMissingAssets(normalized)) throw new Error("Faltan assets locales obligatorios.");
      const yamlText = yaml ?? io.compiledToYaml(normalized);
      await applyLocalConfig(normalized, { yaml: yamlText, assets: [...pendingAssets.values()] });
      workingConfig = clone(normalized);
      pendingAssets = new Map();
      dirty = false;
      setStatus("Guardado en este dispositivo.", "success");
      syncSourceUi();
      renderViewSettings();
      renderInactiveSettings();
      renderImages();
    } catch (error) {
      saveButton.disabled = false;
      setStatus(error.message, "error");
    }
  };

  const showPanel = (name) => {
    for (const tab of dialog.querySelectorAll("[data-settings-tab]")) {
      const active = tab.dataset.settingsTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("active", active);
    }
    for (const panel of dialog.querySelectorAll("[data-settings-panel]")) panel.hidden = panel.dataset.settingsPanel !== name;
  };

  const openSettings = (panel = "schedule") => {
    const state = getState();
    workingConfig = clone(state.config);
    pendingAssets = new Map();
    dirty = false;
    saveButton.disabled = true;
    setStatus("");
    sourceBadge.textContent = state.source === "demo" ? "Configuración demo" : "Configuración local";
    renderViewSettings();
    renderInactiveSettings();
    renderImages();
    showPanel(panel);
    if (!dialog.open) dialog.showModal();
    button.classList.remove("is-hidden");
  };

  const closeSettings = () => {
    if (yamlEditor) {
      yamlEditor.destroy();
      yamlEditor = null;
      yamlHost.replaceChildren();
      document.documentElement.dataset.yamlEditorLoaded = "0";
    }
    clearPreviewUrls();
    if (dialog.open) dialog.close();
    showControl();
  };

  button.addEventListener("click", () => openSettings());
  hint.addEventListener("click", () => openSettings());
  closeButton.addEventListener("click", closeSettings);
  saveButton.addEventListener("click", () => saveWorking());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeSettings(); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeSettings(); });

  for (const tab of dialog.querySelectorAll("[data-settings-tab]")) tab.addEventListener("click", () => showPanel(tab.dataset.settingsTab));

  document.querySelector("#backup-export").addEventListener("click", async () => {
    try {
      setStatus("Preparando copia…");
      const io = await loadConfigIo();
      const state = getState();
      const blob = await io.exportSchedulePackage({ config: state.config, assets: await listAssets() });
      downloadBlob(blob, `${safeFileName(state.config.app?.title)}.schedule`);
      setStatus("Copia exportada.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  });

  document.querySelector("#backup-import").addEventListener("click", async () => {
    const file = await requestFile(".schedule,application/zip,application/vnd.schedule-viewer+zip");
    if (!file) return;
    try {
      setStatus("Validando copia…");
      const io = await loadConfigIo();
      const imported = await io.inspectSchedulePackage(file);
      await applyLocalConfig(imported.config, { yaml: imported.yaml, assets: imported.assets });
      setStatus("Configuración restaurada.", "success");
      syncSourceUi();
      if (dialog.open) openSettings("backup");
    } catch (error) { setStatus(error.message, "error"); }
  });

  document.querySelector("#backup-reset").addEventListener("click", async () => {
    if (!confirm("¿Restablecer la configuración demo y borrar los assets locales?")) return;
    try {
      await resetToDemo();
      setStatus("Demo restaurada.", "success");
      syncSourceUi();
      if (dialog.open) openSettings("schedule");
    } catch (error) { setStatus(error.message, "error"); }
  });

  document.querySelector("#yaml-export").addEventListener("click", async () => {
    try {
      const state = getState();
      const io = await loadConfigIo();
      downloadText(io.compiledToYaml(state.config), `${safeFileName(state.config.app?.title)}.yaml`);
      yamlStatus.textContent = "YAML exportado.";
    } catch (error) { yamlStatus.textContent = error.message; }
  });

  document.querySelector("#yaml-import").addEventListener("click", async () => {
    const file = await requestFile(".yaml,.yml,text/yaml,text/plain");
    if (!file) return;
    try {
      const text = await file.text();
      const io = await loadConfigIo();
      const config = io.yamlToCompiled(text);
      pendingAssets = new Map();
      if (!await resolveMissingAssets(config)) return;
      await applyLocalConfig(config, { yaml: text, assets: [...pendingAssets.values()] });
      yamlStatus.textContent = "YAML importado y aplicado.";
      syncSourceUi();
    } catch (error) { yamlStatus.textContent = error.message; }
  });

  document.querySelector("#yaml-edit").addEventListener("click", async () => {
    try {
      if (yamlEditor) return yamlEditor.focus();
      yamlStatus.textContent = "Cargando editor…";
      const state = getState();
      const io = await loadConfigIo();
      const initialValue = state.yaml || io.compiledToYaml(state.config);
      const editorModule = await import("./lazy/yaml-editor.js");
      document.documentElement.dataset.yamlEditorLoaded = "1";
      yamlEditor = editorModule.mountYamlEditor(yamlHost, {
        initialValue,
        onValidityChange(result) {
          yamlApply.disabled = !result.valid;
          yamlStatus.textContent = result.valid ? "YAML válido." : result.diagnostics[0]?.message ?? "YAML inválido.";
        }
      });
      yamlValidate.disabled = false;
      yamlApply.disabled = !yamlEditor.lastResult.valid;
      yamlHost.hidden = false;
    } catch (error) { yamlStatus.textContent = error.message; }
  });

  yamlValidate.addEventListener("click", () => {
    if (!yamlEditor) return;
    const result = yamlEditor.validate();
    yamlStatus.textContent = result.valid ? "YAML válido." : result.diagnostics[0]?.message ?? "YAML inválido.";
  });

  yamlApply.addEventListener("click", async () => {
    if (!yamlEditor) return;
    const result = yamlEditor.validate();
    if (!result.valid) return;
    try {
      pendingAssets = new Map();
      if (!await resolveMissingAssets(result.config)) return;
      await applyLocalConfig(result.config, { yaml: yamlEditor.getValue(), assets: [...pendingAssets.values()] });
      yamlStatus.textContent = "YAML aplicado y guardado.";
      syncSourceUi();
    } catch (error) { yamlStatus.textContent = error.message; }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "," && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      openSettings();
    }
  });

  if (deviceMode === "touch") {
    window.addEventListener("pointerdown", showControl, { passive: true });
    showControl();
  } else {
    button.classList.remove("is-hidden");
  }
  syncSourceUi();

  return {
    openSettings,
    closeSettings,
    syncState: syncSourceUi,
    isOpen: () => dialog.open
  };
}
