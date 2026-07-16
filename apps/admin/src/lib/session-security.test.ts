import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_RECENT_AUTH_WINDOW_MS,
  isSessionRecentlyAuthenticated,
  recentAuthenticationRequiredResponse,
} from "./session-security";

test("recent authentication accepts only sessions inside the freshness window", () => {
  const now = Date.parse("2026-07-16T04:00:00.000Z");
  assert.equal(isSessionRecentlyAuthenticated(new Date(now - 60_000), now), true);
  assert.equal(
    isSessionRecentlyAuthenticated(new Date(now - ADMIN_RECENT_AUTH_WINDOW_MS), now),
    true,
  );
  assert.equal(
    isSessionRecentlyAuthenticated(new Date(now - ADMIN_RECENT_AUTH_WINDOW_MS - 1), now),
    false,
  );
});

test("recent authentication rejects invalid and future session timestamps", () => {
  const now = Date.parse("2026-07-16T04:00:00.000Z");
  assert.equal(isSessionRecentlyAuthenticated(undefined, now), false);
  assert.equal(isSessionRecentlyAuthenticated("invalid", now), false);
  assert.equal(isSessionRecentlyAuthenticated(new Date(now + 1), now), false);
});

test("recent authentication failure is explicit and never cached", async () => {
  const response = recentAuthenticationRequiredResponse();
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Recent authentication is required. Sign out and sign in again before performing this action.",
    code: "RECENT_AUTH_REQUIRED",
  });
});
