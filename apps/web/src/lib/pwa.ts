type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export const RECENT_AUTH_KEY = "padalix-recent-password-auth";
const RECENT_AUTH_WINDOW_MS = 5 * 60 * 1000;

export function isInstalledPwa() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export async function supportsPlatformPasskeys() {
  if (!isInstalledPwa() || !window.isSecureContext || !("PublicKeyCredential" in window)) return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function markRecentPasswordAuthentication() {
  window.sessionStorage.setItem(RECENT_AUTH_KEY, String(Date.now()));
}

export function hasRecentPasswordAuthentication() {
  const authenticatedAt = Number(window.sessionStorage.getItem(RECENT_AUTH_KEY) ?? 0);
  return authenticatedAt > 0 && Date.now() - authenticatedAt <= RECENT_AUTH_WINDOW_MS;
}

export function clearRecentPasswordAuthentication() {
  window.sessionStorage.removeItem(RECENT_AUTH_KEY);
}
