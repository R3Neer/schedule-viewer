const LOCK_DISTANCE = 10;
const AXIS_RATIO = 1.2;
const WEB_EDGE_GUARD = 28;
const BACK_DISTANCE_THRESHOLD = .33;
const DISMISS_DISTANCE_THRESHOLD = .28;
const BACK_VELOCITY_THRESHOLD = .45;
const DISMISS_VELOCITY_THRESHOLD = .55;
const EXCLUDED_TARGETS = "button, input, select, textarea, label, a, [contenteditable='true'], .cm-editor, [data-no-settings-gesture]";

export function gestureIntent({ dx, dy, allowBack = false, allowDismiss = false, direction = 1 }) {
  const horizontal = dx * direction;
  if (Math.hypot(dx, dy) < LOCK_DISTANCE) return null;
  if (allowBack && horizontal > 0 && horizontal > Math.abs(dy) * AXIS_RATIO) return "back";
  if (allowDismiss && dy > 0 && dy > Math.abs(dx) * AXIS_RATIO) return "dismiss";
  return "reject";
}

export function shouldCompleteGesture({ progress, velocity, kind }) {
  const distance = kind === "dismiss" ? DISMISS_DISTANCE_THRESHOLD : BACK_DISTANCE_THRESHOLD;
  const speed = kind === "dismiss" ? DISMISS_VELOCITY_THRESHOLD : BACK_VELOCITY_THRESHOLD;
  return progress >= distance || velocity >= speed;
}

export function allowsBrowserSafeBack({ coordinate, viewportWidth, safeInset = 0, standalone = false, direction = 1 }) {
  if (standalone) return true;
  const leadingDistance = direction === -1 ? viewportWidth - coordinate : coordinate;
  return leadingDistance > Math.max(WEB_EDGE_GUARD, safeInset + 20);
}

function isStandalone() {
  return Boolean(navigator.standalone) || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches;
}

function eventVelocity(samples, axis, direction = 1) {
  const newest = samples.at(-1);
  if (!newest) return 0;
  const oldest = [...samples].reverse().find(sample => newest.time - sample.time >= 45) || samples[0];
  const elapsed = Math.max(1, newest.time - oldest.time);
  return (newest[axis] - oldest[axis]) / elapsed * direction;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

export function initSettingsGestures({ dialog, motion, deviceMode = "desktop", onDismissRequested = () => {}, isBusy = () => false }) {
  const touchCapable = deviceMode === "touch" || navigator.maxTouchPoints > 0 || matchMedia("(any-pointer: coarse)").matches;
  if (!touchCapable || !window.PointerEvent) return { dispose() {} };

  const sheet = dialog.querySelector(".settings-sheet");
  const header = dialog.querySelector(".settings-header");
  const backZone = document.createElement("div");
  backZone.className = "settings-back-gesture-zone";
  backZone.setAttribute("aria-hidden", "true");
  backZone.setAttribute("data-no-settings-focus", "");
  dialog.toggleAttribute("data-settings-standalone", isStandalone());
  sheet.append(backZone);
  let tracking = null;

  function clearGesture() {
    dialog.removeAttribute("data-settings-gesture");
  }

  function resetTracking(event) {
    if (tracking?.captured) {
      try { sheet.releasePointerCapture(event.pointerId); } catch {}
    }
    tracking = null;
  }

  function onPointerDown(event) {
    if (event.pointerType !== "touch" || !event.isPrimary || event.button > 0 || motion.state !== "open" || isBusy()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(EXCLUDED_TARGETS)) return;
    const inHeader = header.contains(target);
    const inBackZone = backZone.contains(target);
    const panel = target.closest("[data-settings-panel]");
    if (!inHeader && !panel && !inBackZone) return;

    const direction = getComputedStyle(sheet).direction === "rtl" ? -1 : 1;
    const safeInset = Number.parseFloat(getComputedStyle(sheet).getPropertyValue("--settings-safe-leading")) || 0;
    const allowBack = motion.canGoBack && allowsBrowserSafeBack({
      coordinate: event.clientX,
      viewportWidth: window.visualViewport?.width || innerWidth,
      safeInset,
      standalone: isStandalone(),
      direction
    });
    if (!allowBack && !inHeader) return;
    tracking = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      direction,
      allowBack,
      allowDismiss: inHeader,
      mode: null,
      captured: false,
      progress: 0,
      samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }]
    };
  }

  function onPointerMove(event) {
    if (!tracking || event.pointerId !== tracking.pointerId) return;
    const dx = event.clientX - tracking.startX;
    const dy = event.clientY - tracking.startY;
    if (!tracking.mode) {
      const intent = gestureIntent({ dx, dy, allowBack: tracking.allowBack, allowDismiss: tracking.allowDismiss, direction: tracking.direction });
      if (!intent) return;
      if (intent === "reject") { resetTracking(event); return; }
      const started = intent === "back" ? motion.beginBack() : motion.beginDismiss();
      if (!started) { resetTracking(event); return; }
      tracking.mode = intent;
      dialog.dataset.settingsGesture = intent;
      try { sheet.setPointerCapture(event.pointerId); tracking.captured = true; } catch {}
    }

    event.preventDefault();
    tracking.samples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
    tracking.samples = tracking.samples.filter(sample => event.timeStamp - sample.time <= 120);
    if (tracking.mode === "back") {
      tracking.progress = clamp(dx * tracking.direction / Math.max(1, sheet.clientWidth));
      motion.updateBack(tracking.progress);
    } else {
      tracking.progress = clamp(dy / Math.max(1, sheet.clientHeight));
      motion.updateDismiss(tracking.progress);
    }
  }

  function finishGesture(event, cancelled = false) {
    if (!tracking || event.pointerId !== tracking.pointerId) return;
    const item = tracking;
    resetTracking(event);
    if (!item.mode) return;

    if (item.mode === "back") {
      const velocityPx = eventVelocity(item.samples, "x", item.direction);
      const complete = !cancelled && shouldCompleteGesture({ progress: item.progress, velocity: velocityPx, kind: "back" });
      const velocity = velocityPx / Math.max(1, sheet.clientWidth) * 1000;
      void motion.endBack({ complete, velocity }).finally(clearGesture);
      return;
    }

    const velocityPx = eventVelocity(item.samples, "y");
    const complete = !cancelled && shouldCompleteGesture({ progress: item.progress, velocity: velocityPx, kind: "dismiss" });
    const velocity = -velocityPx / Math.max(1, sheet.clientHeight) * 1000;
    if (complete) void Promise.resolve(onDismissRequested({ velocity })).finally(clearGesture);
    else void motion.cancelDismiss({ velocity }).finally(clearGesture);
  }

  const onPointerCancel = event => finishGesture(event, true);

  sheet.addEventListener("pointerdown", onPointerDown);
  sheet.addEventListener("pointermove", onPointerMove, { passive: false });
  sheet.addEventListener("pointerup", finishGesture);
  sheet.addEventListener("pointercancel", onPointerCancel);

  return {
    dispose() {
      if (tracking?.mode === "back") void motion.endBack({ complete: false });
      else if (tracking?.mode === "dismiss") void motion.cancelDismiss();
      tracking = null;
      clearGesture();
      sheet.removeEventListener("pointerdown", onPointerDown);
      sheet.removeEventListener("pointermove", onPointerMove);
      sheet.removeEventListener("pointerup", finishGesture);
      sheet.removeEventListener("pointercancel", onPointerCancel);
      backZone.remove();
    }
  };
}
