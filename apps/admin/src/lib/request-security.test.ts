import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeRequestRateLimit,
  guardAdminMutation,
  isExpectedMutationOrigin,
  resetRequestRateLimitsForTests,
} from "./request-security";

test("mutation origin must exactly match the configured admin origin", () => {
  const matching = new Request("https://admin.padalix.com/api/admin/status", {
    method: "POST",
    headers: { origin: "https://admin.padalix.com" },
  });
  const missing = new Request("https://admin.padalix.com/api/admin/status", { method: "POST" });
  const unexpected = new Request("https://admin.padalix.com/api/admin/status", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  });

  assert.equal(isExpectedMutationOrigin(matching), true);
  assert.equal(isExpectedMutationOrigin(missing), false);
  assert.equal(isExpectedMutationOrigin(unexpected), false);
});

test("request rate limit is isolated by scope and resets after its window", () => {
  resetRequestRateLimitsForTests();
  const input = { scope: "status.update", subject: "admin-1", limit: 2, windowMs: 1_000 };

  assert.equal(consumeRequestRateLimit(input, 1_000).allowed, true);
  assert.equal(consumeRequestRateLimit(input, 1_100).allowed, true);
  assert.equal(consumeRequestRateLimit(input, 1_200).allowed, false);
  assert.equal(consumeRequestRateLimit({ ...input, scope: "status.create" }, 1_200).allowed, true);
  assert.equal(consumeRequestRateLimit(input, 2_001).allowed, true);
});

test("admin mutation guard returns CSRF and rate-limit responses", () => {
  resetRequestRateLimitsForTests();
  const denied = guardAdminMutation(
    new Request("https://admin.padalix.com/api/admin/status", { method: "POST" }),
    { scope: "status.create", subject: "admin-1", limit: 1, windowMs: 60_000, expectedBaseUrl: "https://admin.padalix.com" },
  );
  assert.equal(denied?.status, 403);

  const request = new Request("https://admin.padalix.com/api/admin/status", {
    method: "POST",
    headers: { origin: "https://admin.padalix.com" },
  });
  assert.equal(guardAdminMutation(request, { scope: "status.create", subject: "admin-1", limit: 1, windowMs: 60_000, expectedBaseUrl: "https://admin.padalix.com" }), null);
  const limited = guardAdminMutation(request, { scope: "status.create", subject: "admin-1", limit: 1, windowMs: 60_000, expectedBaseUrl: "https://admin.padalix.com" });
  assert.equal(limited?.status, 429);
  assert.ok(Number(limited?.headers.get("retry-after")) >= 1);
});
