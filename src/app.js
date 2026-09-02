import { getDateInTimezone, selectScheduleAsset } from "./schedule-core.js";

const image = document.querySelector("#schedule-image");
const errorBox = document.querySelector("#error-message");
let config = null;
let currentPath = null;
let resizeTimer = null;

function getRequestedDate() {
  const override = new URLSearchParams(window.location.search).get("date");
  if (override && config.runtime?.allowDateOverride && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return override;
  }
  return getDateInTimezone(config.timezone);
}

function isPortraitNarrow() {
  return window.innerWidth < config.runtime.mobileVerticalMaxWidth
    && window.innerHeight >= window.innerWidth;
}

function resolveAssetUrl(path) {
  return new URL(path, document.baseURI).href;
}

function render() {
  const date = getRequestedDate();
  const selection = selectScheduleAsset(config, {
    date,
    portraitNarrow: isPortraitNarrow()
  });

  if (!selection.path) {
    throw new Error(`No se ha podido resolver un asset para ${date}.`);
  }

  const url = resolveAssetUrl(selection.path);
  document.documentElement.dataset.view = selection.kind;
  document.title = selection.kind === "day" ? `Horario · ${date}` : "Horario UCM";
  image.alt = selection.alt;

  if (currentPath !== url) {
    currentPath = url;
    image.src = url;
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
