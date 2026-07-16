import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function proxy(request: NextRequest) {
  const supplied = request.headers.get("x-correlation-id")?.trim() ?? "";
  const correlationId = correlationIdPattern.test(supplied) ? supplied : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Correlation-ID", correlationId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|icons/|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
