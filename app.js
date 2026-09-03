import {
  collectAssetIds,
  desktopContextMatches,
  desktopToggleTarget,
  getDateInTimezone,
  resolveDefaultInactiveContent,
  selectScheduleContent
} from "./schedule-core.js";
import { renderSelectionContent } from "./runtime-renderer.js";
import { MissingLocalAssetError, releaseResolvedSource, resolveRenderedSource } from "./asset-resolver.js";
import {
  deleteUnreferencedAssets,
  loadUserConfig,
  migrateCachedV3Config,
  resetUserState,
  saveUserState
} from "./local-store.js";
import { applyUiEnvironment } from "./device-ui.js";
import { initSettingsUI } from "./settings-ui.js";

const image = document.querySelector("#schedule-image");
const errorBox = document.querySelector("#error-message");

const uiEnvironment = applyUiEnvironment();
let config = null;
let demoConfig = null;
let configSource = "demo";
let configYaml = null;
let currentKey = null;
let currentRendered = null;
let currentSelection = null;
let manualViewId = null;
let resizeTimer = null;
let renderGeneration = 0;
let settingsController = null;

function getRequestedDate() {
  const override = new URLSearchParams(window.location.search).get("date");
  if (
    override &&
    config.runtime?.allowDateOverride &&
    /^\d{4}-\d{2}-\d{2}$/.test(override)
  ) return override;
  return getDateInTimezone(config.app?.timezone ?? config.timezone);
}

function pointerType() {
  if (window.matchMedia?.("(pointer: fine)").matches) return "fine";
  if (window.matchMedia?.("(pointer: coarse)").matches) return "coarse";
  return "any";
}

function viewportContext() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    orientation: window.innerWidth > window.innerHeight ? "landscape" : "portrait",
    pointer: pointerType()
  };
}

function effectiveManualView(viewport) {
  if (!desktopContextMatches(config, viewport)) return null;
  return manualViewId ?? config.desktop?.defaultView ?? null;
}

function useFallback() {
  if (currentRendered?.fallbackSrc && image.dataset.fallback !== "1") {
    image.dataset.fallback = "1";
    image.src = currentRendered.fallbackSrc;
    return;
  }
  showError(new Error("No se pudo cargar ni regenerar el contenido seleccionado."));
}

async function materializeSelection(selection, viewport) {
  const view = config.views[selection.viewId];
  const phoneArtwork = view?.renderer?.artwork === "phone";
  const rendered = renderSelectionContent(config, selection, {
    baseURI: document.baseURI,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    phoneArtwork
  });
  try {
    return { rendered: await resolveRenderedSource(rendered), phoneArtwork, selection };
  } catch (error) {
    if (!(error instanceof MissingLocalAssetError) || !selection.evaluation?.inactive || selection.content?.source === "default") throw error;
    console.warn(`No existe ${error.assetId}; se usa la imagen inactiva por defecto.`);
    const fallbackContent = resolveDefaultInactiveContent(config, selection.evaluation);
    const fallbackSelection = {
      ...selection,
      alt: fallbackContent.alt ?? selection.alt,
      content: fallbackContent
    };
    const fallbackRendered = renderSelectionContent(config, fallbackSelection, {
      baseURI: document.baseURI,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      phoneArtwork
    });
    return { rendered: await resolveRenderedSource(fallbackRendered), phoneArtwork, selection: fallbackSelection };
  }
}

async function render() {
  const generation = ++renderGeneration;
  const date = getRequestedDate();
  const viewport = viewportContext();

  if (manualViewId && !desktopContextMatches(config, viewport)) manualViewId = null;

  const selected = selectScheduleContent(config, {
    date,
    viewport,
    manualViewId: effectiveManualView(viewport)
  });
  const result = await materializeSelection(selected, viewport);
  if (generation !== renderGeneration) {
    releaseResolvedSource(result.rendered);
    return;
  }

  const selection = result.selection;
  const rendered = result.rendered;
  currentSelection = selection;
  document.documentElement.dataset.view = selection.kind;
  document.documentElement.dataset.viewProfile = selection.viewId;
  document.documentElement.dataset.rangeType = selection.range.type;
  document.documentElement.dataset.rangeStart = selection.range.start;
  document.documentElement.dataset.rangeEnd = selection.range.end;
  document.documentElement.dataset.calendarStatus = selection.evaluation?.status ?? "unknown";
  document.documentElement.dataset.phone = result.phoneArtwork ? "1" : "0";
  document.documentElement.dataset.contentType = rendered.contentType;
  document.documentElement.dataset.manualView = manualViewId ? "1" : "0";
  document.documentElement.dataset.configSource = configSource;
  document.title = `${config.app?.title ?? "Schedule Viewer"} · ${date}`;

  image.alt = selection.alt;
  image.style.objectFit = rendered.fit;
  image.hidden = false;
  errorBox.hidden = true;

  if (currentRendered && currentRendered !== rendered && currentRendered.objectUrl) releaseResolvedSource(currentRendered);
  currentRendered = rendered;
  if (currentKey !== rendered.cacheKey || image.src !== rendered.src) {
    currentKey = rendered.cacheKey;
    delete image.dataset.fallback;
    image.src = rendered.src;
  }
}

function showError(error) {
  console.error(error);
  image.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = "No he podido cargar la vista. Revisa la configuración o vuelve a intentarlo.";
}

function isEditableOrInteractive(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), ' +
    '[role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], ' +
    '[role="spinbutton"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="dialog"]'
  ));
}

function matchesToggleShortcut(event) {
  const shortcut = config.desktop?.shortcuts?.toggleView;
  if (shortcut?.enabled === false) return false;
  const configured = shortcut?.key ?? "Space";
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  if (event.defaultPrevented || event.repeat) return false;
  if (configured === "Space") return event.code === "Space" || event.key === " ";
  return event.code === configured || event.key === configured;
}

function onKeyDown(event) {
  if (!config || settingsController?.isOpen() || !matchesToggleShortcut(event) || isEditableOrInteractive(event.target)) return;
  const viewport = viewportContext();
  const currentViewId = currentSelection?.viewId ?? config.desktop?.defaultView;
  const target = desktopToggleTarget(config, currentViewId, viewport);
  if (!target) return;
  event.preventDefault();
  manualViewId = target;
  render().catch(showError);
}

async function fetchDemoConfig() {
  const response = await fetch("./config/schedule.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`Error cargando configuración demo: ${response.status}`);
  const loaded = await response.json();
  loaded.runtime = { ...(loaded.runtime ?? {}), demo: true };
  return loaded;
}

async function loadInitialConfig() {
  let local = await loadUserConfig();
  if (!local) local = await migrateCachedV3Config();
  demoConfig = await fetchDemoConfig();
  if (local?.normalized) {
    config = local.normalized;
    configSource = "local";
    configYaml = local.yaml ?? null;
  } else {
    config = demoConfig;
    configSource = "demo";
    configYaml = null;
  }
}

async function applyLocalConfig(nextConfig, { yaml = null, assets = [] } = {}) {
  const record = await saveUserState({ config: nextConfig, yaml, assets, source: "local" });
  config = record.normalized;
  configSource = "local";
  configYaml = record.yaml;
  manualViewId = null;
  currentKey = null;
  await deleteUnreferencedAssets(collectAssetIds(config));
  await render();
  settingsController?.syncState();
}

async function restoreDemo() {
  await resetUserState({ clearAssets: true });
  config = structuredClone(demoConfig ?? await fetchDemoConfig());
  configSource = "demo";
  configYaml = null;
  manualViewId = null;
  currentKey = null;
  await render();
  settingsController?.syncState();
}

async function init() {
  try {
    await loadInitialConfig();
    settingsController = initSettingsUI({
      deviceMode: uiEnvironment.deviceMode,
      getState: () => ({ config, source: configSource, yaml: configYaml }),
      applyLocalConfig,
      resetToDemo: restoreDemo
    });

    image.addEventListener("error", useFallback);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => render().catch(showError), 100);
    });

    await render();
  } catch (error) {
    showError(error);
  }
}

init();
