const TITLES = { home: "Ajustes", periods: "Periodos", calendar: "Calendario", presentation: "Presentación", images: "Imágenes", backup: "Copia de seguridad", advanced: "Avanzado", yaml: "Editor YAML" };
const DEPTH = { home: 0, periods: 1, calendar: 1, presentation: 1, images: 1, backup: 1, advanced: 1, yaml: 2 };
const PARENTS = { periods: "home", calendar: "home", presentation: "home", images: "home", backup: "home", advanced: "home", yaml: "advanced" };

// Exact solution for a critically damped spring. Unlike a timing curve, this
// keeps both position and velocity when an animation is retargeted.
export function stepCriticalSpring({ position, velocity, target, response, delta }) {
  const omega = 10 / Math.max(.08, response);
  const displacement = position - target;
  const coefficient = velocity + omega * displacement;
  const decay = Math.exp(-omega * Math.max(0, delta));
  return {
    position: target + (displacement + coefficient * delta) * decay,
    velocity: (coefficient - omega * (displacement + coefficient * delta)) * decay
  };
}

export function initSettingsMotion({ dialog, deviceMode = "desktop", onStateChange = () => {} }) {
  const apple = document.documentElement.dataset.uiTheme === "apple";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const sheet = dialog.querySelector(".settings-sheet");
  const scroll = dialog.querySelector(".settings-scroll");
  const title = dialog.querySelector("#settings-title");
  const back = dialog.querySelector("#settings-back");
  const backLabel = dialog.querySelector("#settings-back-label");
  const panels = new Map([...dialog.querySelectorAll("[data-settings-panel]")].map(panel => [panel.dataset.settingsPanel, panel]));
  const stage = document.createElement("div");
  stage.className = "settings-panel-stage";
  for (const panel of panels.values()) stage.append(panel);
  const navigationEdge = document.createElement("div");
  navigationEdge.className = "settings-navigation-edge";
  navigationEdge.setAttribute("aria-hidden", "true");
  stage.append(navigationEdge);
  scroll.append(stage);
  const scrollPositions = new Map();
  let state = "closed", currentPanel = "home", sheetProgress = 0, nav = null, active = null, frame = 0;

  function setState(value) { state = value; dialog.dataset.motionState = value; onStateChange(value); }
  function duration(value) { return !apple || reduced.matches ? 0 : value; }
  function interrupt({ finish = false } = {}) {
    if (!active) return;
    cancelAnimationFrame(frame);
    const item = active;
    active = null;
    if (finish) { item.render(item.to); item.complete?.(); item.resolve(true); }
    else item.resolve(false);
  }
  function animate({ channel, from, to, milliseconds, render, complete, velocity: initialVelocity = 0 }) {
    let velocity = initialVelocity;
    if (active?.channel === channel) {
      from = active.value;
      velocity = active.velocity;
    }
    interrupt();
    const total = duration(milliseconds);
    if (!total || document.hidden) { render(to); complete?.(); return Promise.resolve(true); }
    render(from);
    return new Promise(resolve => {
      let previous = performance.now();
      const response = Math.max(.14, total / 1000 * Math.max(.45, Math.sqrt(Math.abs(to - from))));
      active = { channel, to, render, complete, resolve, value: from, velocity };
      const tick = now => {
        if (!active) return;
        // The spring has an exact analytical solution, so it remains stable
        // across long frames. Using elapsed time prevents a busy WebKit/WebGL
        // frame from leaving navigation visibly frozen at a partial position.
        const delta = Math.max(0, now - previous) / 1000;
        previous = now;
        const next = stepCriticalSpring({ position: active.value, velocity: active.velocity, target: to, response, delta });
        active.value = next.position; active.velocity = next.velocity;
        render(next.position);
        if (Math.abs(to - next.position) > .002 || Math.abs(next.velocity) > .025) frame = requestAnimationFrame(tick);
        else { const item = active; active = null; render(to); complete?.(); item.resolve(true); }
      };
      frame = requestAnimationFrame(tick);
    });
  }
  function renderSheet(progress) {
    sheetProgress = progress;
    const distance = reduced.matches ? 0 : deviceMode === "touch" ? 72 : 8;
    sheet.style.transform = `translate3d(0, ${(1 - progress) * distance}px, 0)`;
    sheet.style.opacity = String(Math.max(0, Math.min(1, progress)));
    dialog.style.setProperty("--settings-backdrop-progress", String(progress));
  }
  function setOnlyPanel(name) {
    for (const [key, panel] of panels) {
      panel.hidden = key !== name; panel.inert = key !== name;
      panel.removeAttribute("aria-hidden");
      for (const property of ["transform", "opacity", "box-shadow"]) panel.style.removeProperty(property);
    }
    currentPanel = name; dialog.dataset.panel = name; title.textContent = TITLES[name] || "Ajustes";
    back.hidden = name === "home"; back.style.removeProperty("opacity");
    const parent = PARENTS[name];
    backLabel.textContent = parent ? TITLES[parent] : "Ajustes";
    back.setAttribute("aria-label", `Volver a ${parent ? TITLES[parent] : "Ajustes"}`);
    for (const property of ["opacity", "transform", "position", "left", "top", "width"]) title.style.removeProperty(property);
    stage.style.removeProperty("height"); stage.classList.remove("is-navigating");
    navigationEdge.style.removeProperty("transform"); navigationEdge.style.removeProperty("opacity");
    scroll.scrollTop = scrollPositions.get(name) ?? 0; nav = null;
  }
  function prepareNavigation(from, to) {
    scrollPositions.set(from, scroll.scrollTop);
    const fromPanel = panels.get(from), toPanel = panels.get(to);
    fromPanel.hidden = false; toPanel.hidden = false; fromPanel.inert = true; toPanel.inert = true;
    fromPanel.setAttribute("aria-hidden", "true"); toPanel.setAttribute("aria-hidden", "true");
    scroll.scrollTop = 0;
    const width = stage.clientWidth || 320;
    const fromScroll = scrollPositions.get(from) ?? 0;
    const toScroll = scrollPositions.get(to) ?? 0;
    stage.style.height = `${Math.max(fromPanel.scrollHeight, toPanel.scrollHeight, scroll.clientHeight)}px`;
    stage.classList.add("is-navigating");
    const header = title.parentElement, headerRect = header.getBoundingClientRect(), oldTitleRect = title.getBoundingClientRect();
    const ghost = title.cloneNode(true);
    ghost.removeAttribute("id"); ghost.removeAttribute("tabindex"); ghost.setAttribute("aria-hidden", "true");
    ghost.className = "settings-title-ghost";
    ghost.textContent = TITLES[from] || "Ajustes";
    Object.assign(ghost.style, {
      left: `${oldTitleRect.left - headerRect.left}px`, top: `${oldTitleRect.top - headerRect.top}px`, width: `${oldTitleRect.width}px`
    });
    title.before(ghost); title.textContent = TITLES[to] || "Ajustes";
    back.hidden = to === "home";
    const parent = PARENTS[to];
    backLabel.textContent = parent ? TITLES[parent] : "Ajustes";
    back.setAttribute("aria-label", `Volver a ${parent ? TITLES[parent] : "Ajustes"}`);
    const targetTitleRect = title.getBoundingClientRect();
    Object.assign(title.style, {
      position: "absolute", left: `${targetTitleRect.left - headerRect.left}px`, top: `${targetTitleRect.top - headerRect.top}px`, width: `${targetTitleRect.width}px`
    });
    back.hidden = false; dialog.dataset.panel = to;
    const forward = (DEPTH[to] ?? 0) > (DEPTH[from] ?? 0);
    nav = { from, to, fromPanel, toPanel, ghost, progress: 0, forward, width, fromScroll, toScroll };
    return nav;
  }
  function renderNavigation(item, progress) {
    item.progress = progress;
    const { forward, width } = item;
    const fromX = forward ? -width * .25 * progress : width * .25 * progress;
    const toX = forward ? width * (1 - progress) : -width * (1 - progress);
    item.fromPanel.style.transform = `translate3d(${fromX}px, ${-item.fromScroll}px, 0)`;
    item.toPanel.style.transform = `translate3d(${toX}px, ${-item.toScroll}px, 0)`;
    item.fromPanel.style.opacity = "1"; item.toPanel.style.opacity = "1";
    const edgeX = forward ? toX : toX + width - 18;
    navigationEdge.style.transform = `translate3d(${edgeX}px, 0, 0)`;
    navigationEdge.style.opacity = String(Math.min(1, progress * 2));
    item.ghost.style.opacity = String(Math.max(0, 1 - progress * 1.8));
    item.ghost.style.transform = `translateX(${(forward ? -1 : 1) * 24 * progress}px)`;
    title.style.opacity = String(Math.max(0, Math.min(1, (progress - .2) / .8)));
    title.style.transform = `translateX(${(forward ? 1 : -1) * 24 * (1 - progress)}px)`;
    back.style.opacity = String(item.to === "home" ? 1 - progress : progress);
  }
  function completeNavigation(item, destination) { item.ghost.remove(); setOnlyPanel(destination); setState("open"); }
  async function showPanel(name, { instant = false } = {}) {
    if (!panels.has(name)) name = "home";
    if (!dialog.open || !apple || instant || reduced.matches) { interrupt(); nav?.ghost?.remove(); setOnlyPanel(name); return true; }
    if (!nav && name === currentPanel) return true;
    if (nav) {
      if (name === nav.from || name === nav.to) {
        const item = nav, target = name === item.to ? 1 : 0;
        if (Math.abs(item.progress - target) < .001) { completeNavigation(item, name); return true; }
        setState("navigating");
        return animate({
          channel: `navigation:${item.from}:${item.to}`,
          from: item.progress, to: target, milliseconds: target ? 300 : 260,
          render: value => renderNavigation(item, value),
          complete: () => completeNavigation(item, name)
        });
      }
      interrupt({ finish: true });
    }
    const item = prepareNavigation(currentPanel, name); setState("navigating");
    return animate({ channel: `navigation:${item.from}:${item.to}`, from: 0, to: 1, milliseconds: 300, render: value => renderNavigation(item, value), complete: () => completeNavigation(item, item.to) });
  }
  function beginBack() {
    const destination = PARENTS[currentPanel];
    if (!destination || state !== "open" || nav) return false;
    const item = prepareNavigation(currentPanel, destination);
    setState("navigating");
    renderNavigation(item, 0);
    return true;
  }
  function updateBack(progress) {
    if (!nav || nav.forward || state !== "navigating") return false;
    renderNavigation(nav, Math.max(0, Math.min(1, progress)));
    return true;
  }
  function endBack({ complete = false, velocity = 0 } = {}) {
    if (!nav || nav.forward || state !== "navigating") return Promise.resolve(false);
    const item = nav, target = complete ? 1 : 0, destination = complete ? item.to : item.from;
    return animate({
      channel: `navigation:${item.from}:${item.to}`,
      from: item.progress,
      to: target,
      milliseconds: complete ? 260 : 220,
      velocity,
      render: value => renderNavigation(item, value),
      complete: () => completeNavigation(item, destination)
    });
  }
  function beginDismiss() {
    if (!dialog.open || state !== "open") return false;
    setState("dismissing");
    return true;
  }
  function updateDismiss(progress) {
    if (state !== "dismissing") return false;
    renderSheet(1 - Math.max(0, Math.min(1, progress)));
    return true;
  }
  function cancelDismiss({ velocity = 0 } = {}) {
    if (state !== "dismissing") return Promise.resolve(false);
    setState("opening");
    return animate({ channel: "sheet", from: sheetProgress, to: 1, milliseconds: 220, velocity, render: renderSheet, complete: () => setState("open") });
  }
  async function open(panel = "home") {
    if (dialog.open && state === "open") return panel === currentPanel ? true : showPanel(panel);
    if (dialog.open && state === "navigating") return showPanel(panel);
    if (!dialog.open) { setOnlyPanel(panel); dialog.showModal(); }
    setState("opening");
    const completed = await animate({ channel: "sheet", from: sheetProgress, to: 1, milliseconds: deviceMode === "touch" ? 360 : 220, render: renderSheet, complete: () => setState("open") });
    if (completed) title.focus({ preventScroll: true });
    return completed;
  }
  async function close({ velocity = 0 } = {}) {
    if (!dialog.open) return true;
    nav?.ghost?.remove(); if (nav) setOnlyPanel(nav.progress >= .5 ? nav.to : nav.from);
    setState("closing");
    const completed = await animate({ channel: "sheet", from: sheetProgress || 1, to: 0, milliseconds: 280, velocity, render: renderSheet });
    if (completed) {
      dialog.close(); sheet.style.removeProperty("transform"); sheet.style.removeProperty("opacity");
      dialog.style.removeProperty("--settings-backdrop-progress"); setState("closed");
    }
    return completed;
  }
  function settle() {
    if (active) { interrupt({ finish: true }); return; }
    if (nav) { completeNavigation(nav, nav.progress >= .5 ? nav.to : nav.from); return; }
    if (state === "dismissing") { renderSheet(1); setState("open"); }
  }
  const onReducedMotion = () => settle(), onVisibility = () => { if (document.hidden) settle(); }, onResize = () => settle();
  reduced.addEventListener("change", onReducedMotion); document.addEventListener("visibilitychange", onVisibility); window.addEventListener("resize", onResize, { passive: true });
  setOnlyPanel("home"); setState("closed");
  return { open, close, showPanel, beginBack, updateBack, endBack, beginDismiss, updateDismiss, cancelDismiss, settle,
    get state() { return state; }, get panel() { return currentPanel; }, get canGoBack() { return Boolean(PARENTS[currentPanel]); },
    get transitioning() { return !["closed", "open"].includes(state); },
    dispose() { settle(); reduced.removeEventListener("change", onReducedMotion); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("resize", onResize); } };
}
