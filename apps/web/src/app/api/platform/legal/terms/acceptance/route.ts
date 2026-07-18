import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    return Response.json(await platformRequest(session, "/v1/legal/terms/acceptance", {
      method: "POST",
      body: JSON.stringify(body),
    }));
  } catch (error) {
    const status = error instanceof PlatformError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Terms acceptance failed." }, { status });
  }
}
