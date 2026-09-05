import {
  desktopContextMatches,
  desktopToggleTarget,
  getDateInTimezone,
  resolveDefaultInactiveContent,
  selectScheduleContent
} from "./schedule-core.js";
import { collectAssetIds } from "./config-schema.js";
import { renderSelectionContent } from "./runtime-renderer.js";
import { MissingLocalAssetError, releaseResolvedSource, resolveRenderedSource } from "./asset-resolver.js";
import {
  cleanupLegacyMigrationCaches,
  deleteUnreferencedAssets,
  listAssets,
  loadUserConfig,
  migrateCachedV3Config,
  repairStoredImageFits,
  resetUserState,
  saveUserState
} from "./local-store.js";
import { applyUiEnvironment, resolveViewportImageFit } from "./device-ui.js";
import { initSettingsUI } from "./settings-ui.js";
import { initAppUpdates } from "./app-updates.js";

const image = document.querySelector("#schedule-image");
const errorBox = document.querySelector("#error-message");

const uiEnvironment = applyUiEnvironment();
let config = null;
let demoConfig = null;
let configSource = "demo";
let configYaml = null;
let legacyIssue = null;
let legacyRecord = null;
let currentKey = null;
let currentRendered = null;
let currentSelection = null;
let requestedImageFit = "contain";
let manualViewId = null;
const viewportRenderTimers = new Set();
let renderGeneration = 0;
let lastRenderedViewportSignature = null;
let settingsController = null;
let updatesController = null;
let pendingSpaceBeforeReady = false;
let pendingSettingsShortcut = false;
document.documentElement.dataset.appReady = "0";

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
  return uiEnvironment.deviceMode === "touch" ? "coarse" : "fine";
}

function viewportContext() {
  const landscape = window.matchMedia?.("(orientation: landscape)").matches ?? window.innerWidth > window.innerHeight;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    orientation: landscape ? "landscape" : "portrait",
    pointer: pointerType()
  };
}

function viewportSignature(viewport) {
  return `${viewport.width}x${viewport.height}:${viewport.orientation}:${viewport.pointer}`;
}

function applyViewportImageFit() {
  const effectiveFit = resolveViewportImageFit({
    requestedFit: requestedImageFit,
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
  document.documentElement.dataset.requestedImageFit = requestedImageFit;
  document.documentElement.dataset.imageFit = effectiveFit;
  image.style.objectFit = effectiveFit;
}

function scheduleViewportRender() {
  for (const timer of viewportRenderTimers) window.clearTimeout(timer);
  viewportRenderTimers.clear();
  // Safari and installed iOS web apps can report orientation before their
  // layout viewport has settled. The second pass is a no-op when the first
  // one already rendered the final geometry.
  for (const delay of [80, 360]) {
    const timer = window.setTimeout(() => {
      viewportRenderTimers.delete(timer);
      if (viewportSignature(viewportContext()) === lastRenderedViewportSignature) return;
      render().catch(showError);
    }, delay);
    viewportRenderTimers.add(timer);
  }
}

function effectiveManualView(viewport) {
  if (!desktopContextMatches(config, viewport)) return null;
  return manualViewId ?? "horizontal";
}

function useFallback() {
  if (currentRendered?.fallbackSrc && image.dataset.fallback !== "1") {
    image.dataset.fallback = "1";
    document.documentElement.dataset.imageRecovery = "demo";
    image.src = currentRendered.fallbackSrc;
    return;
  }
  showError(new Error("No se pudo cargar ni regenerar el contenido seleccionado."));
}

function demoFallbackFor(date, viewport) {
  if (!demoConfig) return null;
  const selection = selectScheduleContent(demoConfig, {
    date,
    viewport,
    manualViewId: desktopContextMatches(demoConfig, viewport) ? manualViewId : null
  });
  return renderSelectionContent(demoConfig, selection, {
    baseURI: document.baseURI,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    phoneArtwork: false
  });
}

async function materializeSelection(selection, viewport) {
  const phoneArtwork = false;
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
    console.warn(`${error.assetId} does not exist; using the default inactive image.`);
    const fallbackContent = resolveDefaultInactiveContent(config, selection.evaluation, selection.viewId);
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
  let result;
  try {
    result = await materializeSelection(selected, viewport);
  } catch (error) {
    const fallback = configSource === "local" ? demoFallbackFor(date, viewport) : null;
    if (!fallback) throw error;
    console.warn("The configured local image is no longer available; using the demo without changing Settings.", error);
    result = { rendered: { ...fallback, cacheKey: `recovered:${fallback.cacheKey}` }, phoneArtwork: false, selection: selected, recovered: true };
    document.documentElement.dataset.imageRecovery = "demo";
  }
  if (generation !== renderGeneration) {
    releaseResolvedSource(result.rendered);
    return;
  }

  const selection = result.selection;
  const rendered = result.rendered;
  if (configSource === "local" && !rendered.fallbackSrc) {
    const fallback = demoFallbackFor(date, viewport);
    if (fallback?.src && fallback.src !== rendered.src) rendered.fallbackSrc = fallback.src;
  }
  currentSelection = selection;
  lastRenderedViewportSignature = viewportSignature(viewport);
  document.documentElement.dataset.view = selection.kind;
  document.documentElement.dataset.viewProfile = selection.viewId;
  document.documentElement.dataset.rangeType = selection.range.type;
  document.documentElement.dataset.rangeStart = selection.range.start;
  document.documentElement.dataset.rangeEnd = selection.range.end;
  document.documentElement.dataset.calendarStatus = selection.evaluation?.status ?? "unknown";
  document.documentElement.dataset.contentType = rendered.contentType;
  document.documentElement.dataset.manualView = manualViewId ? "1" : "0";
  document.documentElement.dataset.configSource = configSource;
  document.title = `Schedule Viewer · ${date}`;

  image.alt = selection.alt;
  requestedImageFit = rendered.fit;
  image.hidden = false;
  errorBox.hidden = true;

  if (currentRendered && currentRendered !== rendered && currentRendered.objectUrl) releaseResolvedSource(currentRendered);
  currentRendered = rendered;
  if (currentKey !== rendered.cacheKey || image.src !== rendered.src) {
    currentKey = rendered.cacheKey;
    delete image.dataset.fallback;
    if (!result.recovered) delete document.documentElement.dataset.imageRecovery;
    image.src = rendered.src;
  }
  applyViewportImageFit();
}

function showError(error) {
  console.error(error);
  document.documentElement.dataset.appReady = "0";
  image.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = "The view could not be loaded. Check the configuration or try again.";
}

image.addEventListener("load", applyViewportImageFit);

function isEditableOrInteractive(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), ' +
    '[role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], ' +
    '[role="spinbutton"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="dialog"]'
  ));
}

function isPlainSpace(event) {
  return (event.code === "Space" || event.key === " ") &&
    !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
    !event.defaultPrevented && !event.repeat;
}

function matchesToggleShortcut(event) {
  if (config.presentation?.desktopToggle === false) return false;
  const configured = "Space";
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  if (event.defaultPrevented || event.repeat) return false;
  if (configured === "Space") return event.code === "Space" || event.key === " ";
  return event.code === configured || event.key === configured;
}

function toggleDesktopView() {
  if (config.presentation?.desktopToggle === false) return false;
  const viewport = viewportContext();
  const currentViewId = currentSelection?.viewId ?? "horizontal";
  const target = desktopToggleTarget(config, currentViewId, viewport);
  if (!target) return false;
  manualViewId = target;
  render().catch(showError);
  return true;
}

function onKeyDown(event) {
  if (!config) {
    if (isPlainSpace(event) && !isEditableOrInteractive(event.target)) {
      event.preventDefault();
      pendingSpaceBeforeReady = true;
    }
    return;
  }
  if (settingsController?.isOpen() || !matchesToggleShortcut(event) || isEditableOrInteractive(event.target)) return;
  const viewport = viewportContext();
  const currentViewId = currentSelection?.viewId ?? "horizontal";
  const target = desktopToggleTarget(config, currentViewId, viewport);
  if (!target) return;
  event.preventDefault();
  manualViewId = target;
  render().catch(showError);
}

function matchesSettingsShortcut(event) {
  return (event.key === "," || event.code === "Comma") &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey && !event.shiftKey;
}

function onSettingsShortcut(event) {
  if (!matchesSettingsShortcut(event)) return;
  event.preventDefault();
  if (settingsController) {
    settingsController.openSettings();
    return;
  }
  pendingSettingsShortcut = true;
}

async function fetchDemoConfig() {
  const response = await fetch("./config/schedule.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load the demo configuration: ${response.status}`);
  const loaded = await response.json();
  loaded.runtime = { ...(loaded.runtime ?? {}), demo: true };
  return loaded;
}

async function loadInitialConfig() {
  let local = await loadUserConfig();
  if (local?.normalized?.version === 4 && local.imageFitRevision == null && local.yaml) {
    const io = await import("./lazy/config-io.js");
    local = await repairStoredImageFits(local, io.yamlToCompiled);
  }
  if (!local) {
    local = await migrateCachedV3Config();
  } else {
    await cleanupLegacyMigrationCaches();
  }
  demoConfig = await fetchDemoConfig();
  if (local?.normalized) {
    config = local.normalized;
    configYaml = local.yaml ?? null;
    configSource = "local";
  } else {
    legacyIssue = local?.legacyIncompatible ? local.error : null;
    legacyRecord = local?.legacy ?? null;
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
  legacyIssue = null;
  legacyRecord = null;
  manualViewId = null;
  currentKey = null;
  await deleteUnreferencedAssets(collectAssetIds(config));
  await cleanupLegacyMigrationCaches();
  await render();
  settingsController?.syncState();
}

async function restoreDemo() {
  await resetUserState({ clearAssets: true });
  config = structuredClone(demoConfig ?? await fetchDemoConfig());
  configSource = "demo";
  configYaml = null;
  legacyIssue = null;
  legacyRecord = null;
  manualViewId = null;
  currentKey = null;
  await cleanupLegacyMigrationCaches();
  await render();
  settingsController?.syncState();
}

async function init() {
  try {
    await loadInitialConfig();
    settingsController = initSettingsUI({
      deviceMode: uiEnvironment.deviceMode,
      getState: () => ({ config, source: configSource, yaml: configYaml, legacyIssue }),
      applyLocalConfig,
      exportLegacyConfig: legacyRecord ? async () => {
        const io = await import("./lazy/config-io.js");
        return io.exportLegacyPackage({ record: legacyRecord, assets: await listAssets() });
      } : null,
      onUpdateSafetyChange: () => updatesController?.reconsider(),
      resetToDemo: restoreDemo
    });

    image.addEventListener("error", useFallback);
    window.addEventListener("resize", scheduleViewportRender, { passive: true });
    window.addEventListener("orientationchange", scheduleViewportRender, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleViewportRender, { passive: true });
    window.screen?.orientation?.addEventListener?.("change", scheduleViewportRender);

    await render();
    document.documentElement.dataset.appReady = "1";
    updatesController = initAppUpdates({ isSafeToReload: () => settingsController.isSafeToReload() });

    if (pendingSettingsShortcut) {
      pendingSettingsShortcut = false;
      settingsController.openSettings();
    }
    if (pendingSpaceBeforeReady) {
      pendingSpaceBeforeReady = false;
      toggleDesktopView();
    }
  } catch (error) {
    showError(error);
  }
}

document.addEventListener("keydown", onSettingsShortcut);
window.addEventListener("keydown", onKeyDown);
init();
