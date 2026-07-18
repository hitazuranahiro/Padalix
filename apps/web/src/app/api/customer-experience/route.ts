import { getCustomerSession } from "@/lib/session";
import {
  completeCustomerOnboarding,
  getCustomerExperience,
  updateCustomerNotifications,
  validNotificationKeys,
} from "@/lib/customer-experience-store";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await getCustomerExperience(session.user.id));
  } catch {
    return Response.json({ error: "Experience state unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { action?: unknown; keys?: unknown } | null;
  try {
    if (body?.action === "completeOnboarding") {
      await completeCustomerOnboarding(session.user.id);
      return Response.json({ onboardingComplete: true });
    }
    if (body?.action === "readNotifications" || body?.action === "dismissNotifications") {
      const keys = validNotificationKeys(body.keys);
      if (!keys.length) return Response.json({ error: "Valid notification keys required" }, { status: 400 });
      await updateCustomerNotifications(session.user.id, keys, body.action === "dismissNotifications");
      return Response.json({ updated: keys });
    }
    return Response.json({ error: "Unsupported experience action" }, { status: 400 });
  } catch {
    return Response.json({ error: "Experience state unavailable" }, { status: 503 });
  }
}

