type RateLimitBucket = { count: number; resetAt: number };

type RateLimitInput = {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
};

type MutationGuardInput = RateLimitInput & {
  expectedBaseUrl?: string;
};

const globalForRequestSecurity = globalThis as typeof globalThis & {
  padalixMutationRateLimits?: Map<string, RateLimitBucket>;
};

const mutationRateLimits = globalForRequestSecurity.padalixMutationRateLimits ?? new Map<string, RateLimitBucket>();
globalForRequestSecurity.padalixMutationRateLimits = mutationRateLimits;

function pruneExpiredBuckets(now: number) {
  if (mutationRateLimits.size < 10_000) return;
  for (const [key, bucket] of mutationRateLimits) {
    if (bucket.resetAt <= now) mutationRateLimits.delete(key);
  }
  while (mutationRateLimits.size >= 10_000) {
    const oldest = mutationRateLimits.keys().next().value as string | undefined;
    if (!oldest) break;
    mutationRateLimits.delete(oldest);
  }
}

export function consumeRequestRateLimit(input: RateLimitInput, now = Date.now()) {
  pruneExpiredBuckets(now);
  const key = `${input.scope}\u0000${input.subject}`;
  const current = mutationRateLimits.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + input.windowMs }
    : current;
  bucket.count += 1;
  mutationRateLimits.set(key, bucket);

  return {
    allowed: bucket.count <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function isExpectedMutationOrigin(request: Request, expectedBaseUrl?: string) {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;
  try {
    const expectedOrigin = new URL(expectedBaseUrl || request.url).origin;
    return suppliedOrigin === expectedOrigin;
  } catch {
    return false;
  }
}

export function guardAdminMutation(request: Request, input: MutationGuardInput): Response | null {
  if (!isExpectedMutationOrigin(request, input.expectedBaseUrl)) {
    return Response.json({ error: "Request origin is not allowed." }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const rateLimit = consumeRequestRateLimit(input);
  if (rateLimit.allowed) return null;
  return Response.json({ error: "Too many requests. Try again shortly." }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(rateLimit.retryAfterSeconds),
      "RateLimit-Limit": String(rateLimit.limit),
      "RateLimit-Remaining": String(rateLimit.remaining),
      "RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
    },
  });
}

export function resetRequestRateLimitsForTests() {
  mutationRateLimits.clear();
}
