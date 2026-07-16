import { getCustomerSession } from "@/lib/session";

export async function customerEvidenceRequest(
  request: Request,
  targetUrl: string | undefined,
  body: Record<string, unknown>,
) {
  const session = await getCustomerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const secret = process.env.KYC_INGEST_SECRET;
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  const requestOrigin = request.headers.get("origin");
  if (!targetUrl || !secret || !appOrigin)
    return Response.json(
      { error: "Identity evidence service is not configured." },
      { status: 503 },
    );
  if (requestOrigin !== appOrigin)
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "padalix-web",
        "x-forwarded-for":
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
      },
      body: JSON.stringify({
        ...body,
        authSubject: session.user.id,
        email: session.user.email,
        fullName: session.user.name,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return Response.json(
        { error: result.error || "Identity evidence request failed." },
        { status: response.status >= 500 ? 503 : response.status },
      );
    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error("KYC evidence service unavailable", error);
    return Response.json(
      { error: "Identity evidence service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
