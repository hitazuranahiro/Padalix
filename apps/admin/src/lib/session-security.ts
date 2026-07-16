export const ADMIN_RECENT_AUTH_WINDOW_MS = 5 * 60 * 1000;

export function isSessionRecentlyAuthenticated(
  createdAt: Date | string | number | null | undefined,
  now = Date.now(),
  windowMs = ADMIN_RECENT_AUTH_WINDOW_MS,
) {
  if (!createdAt || !Number.isFinite(windowMs) || windowMs <= 0) return false;
  const authenticatedAt = new Date(createdAt).getTime();
  if (!Number.isFinite(authenticatedAt) || authenticatedAt > now) return false;
  return now - authenticatedAt <= windowMs;
}

export function recentAuthenticationRequiredResponse() {
  return Response.json(
    {
      error: "Recent authentication is required. Sign out and sign in again before performing this action.",
      code: "RECENT_AUTH_REQUIRED",
    },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
