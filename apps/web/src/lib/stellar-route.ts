import { PlatformError } from "@/lib/platform";

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

export function stellarRouteError(error: unknown, fallback: string) {
  return Response.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: error instanceof PlatformError ? error.status : 503 },
  );
}
