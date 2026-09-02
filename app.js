import { getDateInTimezone, selectScheduleContent } from "./schedule-core.js";
import { renderSelectionContent } from "./content-renderer.js";

const image = document.querySelector("#schedule-image");
const errorBox = document.querySelector("#error-message");
let config = null;
let currentKey = null;
let currentRendered = null;
let resizeTimer = null;

function getRequestedDate() {
  const override = new URLSearchParams(window.location.search).get("date");
  if (override && config.runtime?.allowDateOverride && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return getDateInTimezone(config.timezone);
}

function isPortraitNarrow() {
  return window.innerWidth < config.runtime.mobileVerticalMaxWidth && window.innerHeight >= window.innerWidth;
}

function isPhoneLandscape() {
  return window.innerWidth > window.innerHeight && window.innerWidth <= 950 && window.innerHeight <= 520;
}

function usePhoneArtwork() {
  return isPortraitNarrow() || isPhoneLandscape();
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
  const selection = selectScheduleContent(config, {
    date,
    portraitNarrow: isPortraitNarrow()
  });

  const rendered = renderSelectionContent(config, selection, {
    baseURI: document.baseURI,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    phoneArtwork: usePhoneArtwork()
  });

  document.documentElement.dataset.view = selection.kind;
  document.documentElement.dataset.phone = usePhoneArtwork() ? "1" : "0";
  document.documentElement.dataset.contentType = rendered.contentType;
  document.title = selection.kind === "day" ? `Horario · ${date}` : "Horario UCM";

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
  errorBox.textContent = "No he podido cargar el horario. Revisa la configuración o vuelve a intentarlo.";
}

async function init() {
  try {
    const response = await fetch("./config/schedules.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Error cargando configuración: ${response.status}`);
    config = await response.json();
    image.addEventListener("error", useFallback);
    render();
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        try { render(); } catch (error) { showError(error); }
      }, 100);
    });
  } catch (error) {
    showError(error);
  }
}

init();
