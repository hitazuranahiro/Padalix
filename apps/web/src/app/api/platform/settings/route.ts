import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

async function forward(method: "GET" | "PATCH", request?: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = method === "PATCH" ? await request!.json() : undefined;
    return Response.json(await platformRequest(session, "/v1/settings", {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  } catch (error) {
    const status = error instanceof PlatformError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Settings request failed." }, { status });
  }
}

export async function GET() {
  return forward("GET");
}

export async function PATCH(request: Request) {
  return forward("PATCH", request);
}
