import {
  desktopContextMatches,
  desktopToggleTarget,
  getDateInTimezone,
  selectScheduleContent
} from "./schedule-core.js";
import { renderSelectionContent } from "./content-renderer.js";

const image = document.querySelector("#schedule-image");
const errorBox = document.querySelector("#error-message");

let config = null;
let currentKey = null;
let currentRendered = null;
let currentSelection = null;
let manualViewId = null;
let resizeTimer = null;

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

function render() {
  const date = getRequestedDate();
  const viewport = viewportContext();

  if (manualViewId && !desktopContextMatches(config, viewport)) {
    manualViewId = null;
  }

  const selection = selectScheduleContent(config, {
    date,
    viewport,
    manualViewId: effectiveManualView(viewport)
  });
  const view = config.views[selection.viewId];
  const phoneArtwork = view?.renderer?.artwork === "phone";

  const rendered = renderSelectionContent(config, selection, {
    baseURI: document.baseURI,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    phoneArtwork
  });

  currentSelection = selection;
  document.documentElement.dataset.view = selection.kind;
  document.documentElement.dataset.viewProfile = selection.viewId;
  document.documentElement.dataset.rangeType = selection.range.type;
  document.documentElement.dataset.rangeStart = selection.range.start;
  document.documentElement.dataset.rangeEnd = selection.range.end;
  document.documentElement.dataset.calendarStatus = selection.evaluation?.status ?? "unknown";
  document.documentElement.dataset.phone = phoneArtwork ? "1" : "0";
  document.documentElement.dataset.contentType = rendered.contentType;
  document.documentElement.dataset.manualView = manualViewId ? "1" : "0";
  document.title = `${config.app?.title ?? "Schedule Viewer"} · ${date}`;

  image.alt = selection.alt;
  image.style.objectFit = rendered.fit;
  image.hidden = false;
  errorBox.hidden = true;

  currentRendered = rendered;
  if (currentKey !== rendered.cacheKey) {
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
    '[role="spinbutton"], [role="combobox"], [role="listbox"], [role="menuitem"]'
  ));
}

function matchesToggleShortcut(event) {
  const configured = config.desktop?.shortcuts?.toggleView?.key ?? "Space";
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  if (event.defaultPrevented || event.repeat) return false;
  if (configured === "Space") return event.code === "Space" || event.key === " ";
  return event.code === configured || event.key === configured;
}

function onKeyDown(event) {
  if (!config || !matchesToggleShortcut(event) || isEditableOrInteractive(event.target)) return;
  const viewport = viewportContext();
  const currentViewId = currentSelection?.viewId ?? config.desktop?.defaultView;
  const target = desktopToggleTarget(config, currentViewId, viewport);
  if (!target) return;
  event.preventDefault();
  manualViewId = target;
  try {
    render();
  } catch (error) {
    showError(error);
  }
}

async function init() {
  try {
    const response = await fetch("./config/schedule.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Error cargando configuración: ${response.status}`);
    config = await response.json();

    image.addEventListener("error", useFallback);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        try {
          render();
        } catch (error) {
          showError(error);
        }
      }, 100);
    });

    render();
  } catch (error) {
    showError(error);
  }
}

init();
