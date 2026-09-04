export function detectDeviceMode({
  maxTouchPoints = 0,
  pointerCoarse = false,
  pointerFine = false,
  hoverNone = false,
  userAgent = "",
  platform = ""
} = {}) {
  const ua = String(userAgent);
  const navPlatform = String(platform);

  // Mobile browsers and iOS/iPadOS PWAs should never depend exclusively on
  // pointer media queries. Real devices can transiently report surprising
  // combinations while entering standalone mode or switching input context.
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return "touch";
  if (/Macintosh/i.test(ua) && /Mac/i.test(navPlatform) && maxTouchPoints > 1) return "touch";
  if (pointerCoarse) return "touch";
  if (maxTouchPoints > 0 && hoverNone) return "touch";
  if (maxTouchPoints > 1 && !pointerFine) return "touch";
  return "desktop";
}

export function isApplePlatform({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  if (/Macintosh|Mac OS X/i.test(userAgent)) return true;
  if (/Mac/i.test(platform)) return true;
  // iPadOS puede presentarse como Macintosh en Safari de escritorio.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

export function readDeviceCapabilities(win = window, nav = navigator) {
  const match = (query) => Boolean(win.matchMedia?.(query).matches);
  return {
    maxTouchPoints: Number(nav.maxTouchPoints ?? 0),
    pointerCoarse: match("(pointer: coarse)"),
    pointerFine: match("(pointer: fine)"),
    hoverNone: match("(hover: none)"),
    userAgent: String(nav.userAgent ?? ""),
    platform: String(nav.platform ?? "")
  };
}

export function applyUiEnvironment(doc = document, win = window, nav = navigator) {
  const capabilities = readDeviceCapabilities(win, nav);
  const deviceMode = detectDeviceMode(capabilities);
  const uiTheme = isApplePlatform(capabilities) ? "apple" : "generic";
  doc.documentElement.dataset.deviceMode = deviceMode;
  doc.documentElement.dataset.uiTheme = uiTheme;
  return { deviceMode, uiTheme, capabilities };
}
