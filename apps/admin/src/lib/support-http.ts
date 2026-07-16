import { NextResponse } from "next/server";
import { consumeRequestRateLimit } from "@/lib/request-security";

const allowedOrigins = (process.env.SUPPORT_ALLOWED_ORIGINS ?? "http://localhost:3000,https://padalix.com")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export function supportOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && allowedOrigins.includes(origin));
}

export function supportCors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.includes(origin) ? {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "600",
  } : {};
}
export function supportJson(request: Request, data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  Object.entries(supportCors(request)).forEach(([key, value]) => headers.set(key, value));
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}
export function clientIp(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"; }

export function supportPreflight(request: Request) {
  return supportOriginAllowed(request)
    ? new NextResponse(null, { status: 204, headers: supportCors(request) })
    : new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } });
}

export function guardSupportOrigin(request: Request) {
  return supportOriginAllowed(request)
    ? null
    : supportJson(request, { error: "Request origin is not allowed." }, { status: 403 });
}

export function guardSupportRateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const result = consumeRequestRateLimit({ scope, subject: clientIp(request), limit, windowMs });
  if (result.allowed) return null;
  return supportJson(request, { error: "Too many requests. Try again later." }, {
    status: 429,
    headers: {
      "Retry-After": String(result.retryAfterSeconds),
      "RateLimit-Limit": String(result.limit),
      "RateLimit-Remaining": String(result.remaining),
      "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    },
  });
}
