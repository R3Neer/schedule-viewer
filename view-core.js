function orientationFor(viewport) {
  if (viewport.orientation) return viewport.orientation;
  return viewport.width > viewport.height ? "landscape" : "portrait";
}

export function viewMatches(view, viewport) {
  const when = view.when ?? {};
  const orientation = orientationFor(viewport);
  if (when.orientation && when.orientation !== "any" && when.orientation !== orientation) return false;
  if (when.pointer && when.pointer !== "any" && when.pointer !== viewport.pointer) return false;
  if (when.minWidth != null && viewport.width < when.minWidth) return false;
  if (when.maxWidth != null && viewport.width > when.maxWidth) return false;
  if (when.minHeight != null && viewport.height < when.minHeight) return false;
  if (when.maxHeight != null && viewport.height > when.maxHeight) return false;
  return true;
}

function specificity(view) {
  return Object.values(view.when ?? {}).filter((value) => value != null && value !== "any").length;
}

export function selectViewProfile(config, { viewport, manualViewId = null } = {}) {
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) {
    throw new TypeError("selectViewProfile requiere viewport width/height.");
  }
  if (manualViewId != null) {
    const manual = config.views?.[manualViewId];
    if (!manual) throw new Error(`Vista manual inexistente: ${manualViewId}`);
    return manual;
  }
  const candidates = Object.values(config.views ?? {})
    .filter((view) => !view.manualOnly && viewMatches(view, viewport))
    .sort((a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) ||
      specificity(b) - specificity(a) ||
      (a.order ?? 0) - (b.order ?? 0)
    );
  if (!candidates.length) throw new Error("Ningún perfil de vista coincide con el viewport.");
  return candidates[0];
}

export function desktopContextMatches(config, viewport) {
  return viewMatches({ when: config.desktop?.when ?? {} }, viewport);
}

export function desktopToggleTarget(config, currentViewId, viewport) {
  if (!desktopContextMatches(config, viewport)) return null;
  const primary = config.desktop?.primaryView;
  const secondary = config.desktop?.secondaryView;
  if (!primary || !secondary || !config.views?.[primary] || !config.views?.[secondary]) return null;
  return currentViewId === secondary ? primary : secondary;
}
