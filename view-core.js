export function orientationFor(viewport) {
  if (viewport?.orientation) return viewport.orientation;
  return viewport?.width > viewport?.height ? "landscape" : "portrait";
}

export function selectViewProfile(config, { viewport, manualViewId = null } = {}) {
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) throw new TypeError("selectViewProfile requiere viewport width/height.");
  const id = manualViewId ?? (orientationFor(viewport) === "landscape" ? "horizontal" : "vertical");
  if (!["vertical", "horizontal"].includes(id)) throw new Error(`Vista manual inexistente: ${id}`);
  return { id, orientation: id === "horizontal" ? "landscape" : "portrait" };
}

export function desktopContextMatches(_config, viewport) {
  return viewport?.pointer === "fine" && viewport.width >= 760;
}

export function desktopToggleTarget(config, currentViewId, viewport) {
  if (!desktopContextMatches(config, viewport) || config.presentation?.desktopToggle === false) return null;
  return currentViewId === "vertical" ? "horizontal" : "vertical";
}

export function viewMatches(view, viewport) {
  const orientation = orientationFor(viewport);
  return !view?.when?.orientation || view.when.orientation === "any" || view.when.orientation === orientation;
}
