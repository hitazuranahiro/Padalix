import { NextResponse } from "next/server";

const allowedOrigins = (process.env.SUPPORT_ALLOWED_ORIGINS ?? "http://localhost:3000,https://padalix.com").split(",").map((value) => value.trim());

export function supportCors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } : {};
}
export function supportJson(request: Request, data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  Object.entries(supportCors(request)).forEach(([key, value]) => headers.set(key, value));
  return NextResponse.json(data, { ...init, headers });
}
export function clientIp(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"; }
