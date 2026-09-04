const VENDOR_MODULE = "./lazy/apple-glass.js";
const VENDOR_CSS = "./lazy/apple-glass.css";
let vendorPromise;

function loadVendor() {
  if (!vendorPromise) {
    const css = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL(VENDOR_CSS, import.meta.url).href;
      link.dataset.appleGlassCss = "1";
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    });
    vendorPromise = Promise.all([css, import(VENDOR_MODULE)]).then(([, module]) => module);
  }
  return vendorPromise;
}

// The source image is appropriate for the floating control, but not for
// controls inside an opaque dialog. Never project the schedule through the sheet.
export function initAppleGlass({ uiTheme, sourceElement }) {
  const html = document.documentElement;
  const button = document.querySelector("#settings-button");
  const dialog = document.querySelector("#settings-dialog");
  if (uiTheme !== "apple" || !sourceElement || !button) {
    html.dataset.appleGlass = "disabled";
    return { dispose() {}, remount() {} };
  }
  let instance = null;
  let underlay = null;
  let disposed = false;
  let failed = false;
  let pending = false;
  let generation = 0;
  let resizeTimer;
  const accessibility = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)");
  const visible = () => {
    const coveredBySettings = dialog.open && dialog.dataset.motionState !== "opening";
    return !disposed && !failed && !coveredBySettings && !button.classList.contains("is-hidden") && !document.hidden && !accessibility.matches;
  };
  // Keep an existing renderer alive while the control fades behind an opening
  // sheet, but never finish a pending WebGL mount during that animation.
  const canMount = () => visible() && !dialog.open;
  const clear = () => {
    generation++;
    instance?.dispose();
    instance = null;
    underlay?.remove();
    underlay = null;
    if (button.classList.contains("has-liquid-glass")) button.classList.remove("has-liquid-glass");
    delete button.dataset.liquidGlassRender;
  };
  const sync = async () => {
    if (!visible()) {
      if (instance || pending) clear();
      return;
    }
    if (dialog.open || instance || pending || !sourceElement.complete || !sourceElement.naturalWidth) return;
    pending = true;
    const current = generation;
    try {
      const { mountGlass } = await loadVendor();
      if (!canMount() || current !== generation) return;
      underlay = document.createElement("span");
      underlay.className = "apple-glass-underlay";
      underlay.setAttribute("aria-hidden", "true");
      button.prepend(underlay);
      instance = mountGlass(underlay, {
        source: sourceElement, mode: "auto", radius: 22,
        strength: 10, depth: 9, dome: 7, edge: .78, glow: .12,
        chroma: .08, blur: 1.5, tint: 25, spec: .7, vibrancy: .08
      });
      button.classList.add("has-liquid-glass");
      button.dataset.liquidGlassRender = underlay.dataset.render || "pending";
      html.dataset.appleGlass = "ready";
    } catch (error) {
      failed = true;
      clear();
      html.dataset.appleGlass = "fallback";
      console.warn("Se mantiene el material CSS del control de Ajustes.", error);
    } finally {
      pending = false;
    }
  };
  const remount = () => { clear(); void sync(); };
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(remount, 140); };
  const observer = new MutationObserver(() => void sync());
  observer.observe(dialog, { attributes: true, attributeFilter: ["open", "data-motion-state"] });
  observer.observe(button, { attributes: true, attributeFilter: ["class"] });
  sourceElement.addEventListener("load", remount);
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", sync);
  accessibility.addEventListener("change", sync);
  html.dataset.appleGlass = "loading";
  void sync();
  return {
    remount,
    dispose() {
      disposed = true;
      observer.disconnect();
      clearTimeout(resizeTimer);
      sourceElement.removeEventListener("load", remount);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", sync);
      accessibility.removeEventListener("change", sync);
      clear();
    }
  };
}
function autoStart() {
  if (!document.documentElement.dataset.uiTheme) return requestAnimationFrame(autoStart);
  globalThis.__scheduleViewerAppleGlass?.dispose();
  globalThis.__scheduleViewerAppleGlass = initAppleGlass({
    uiTheme: document.documentElement.dataset.uiTheme,
    sourceElement: document.querySelector("#schedule-image")
  });
}
if (typeof document !== "undefined") autoStart();
