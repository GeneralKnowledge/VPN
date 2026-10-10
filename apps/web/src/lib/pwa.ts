/** True when the app is running as an installed PWA (standalone / iOS home screen). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)");
  if (media.matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chromeOrFx = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && !chromeOrFx;
}

export const INSTALL_DISMISS_KEY = "northstar-pwa-install-dismissed";
