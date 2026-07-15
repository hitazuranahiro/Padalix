import { createHash, randomUUID } from "node:crypto";

const documentTypes = ["passport", "national_id", "drivers_license"] as const;
type DocumentType = (typeof documentTypes)[number];

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const ingestUrl = process.env.KYC_INGEST_URL;
  const ingestSecret = process.env.KYC_INGEST_SECRET;
  const requestOrigin = request.headers.get("origin");
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (!ingestUrl || !ingestSecret || !appOrigin) {
    return Response.json({ error: "Identity service is not configured." }, { status: 503 });
  }
  if (requestOrigin && appOrigin && requestOrigin !== appOrigin) {
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const fullName = clean(body.fullName, 150);
  const email = clean(body.email, 254).toLowerCase();
  const countryCode = clean(body.countryCode, 2).toUpperCase();
  const documentType = clean(body.documentType, 40) as DocumentType;

  if (
    fullName.length < 2 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    !/^[A-Z]{2}$/.test(countryCode) ||
    !documentTypes.includes(documentType)
  ) {
    return Response.json({ error: "Complete all identity fields before submitting." }, { status: 400 });
  }

  const submissionId = randomUUID();
  const authSubject = `pwa:${createHash("sha256").update(email).digest("hex")}`;
  const evidencePrefix = `pending/${authSubject}/${submissionId}`;
  const documents = [
    {
      type: documentType,
      storageKey: `${evidencePrefix}/document.jpg`,
      filename: `${documentType}-capture.jpg`,
      mimeType: "image/jpeg",
    },
    {
      type: "selfie",
      storageKey: `${evidencePrefix}/selfie.jpg`,
      filename: "liveness-selfie.jpg",
      mimeType: "image/jpeg",
    },
  ];

  try {
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ingestSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        authSubject,
        email,
        fullName,
        countryCode,
        tier: "individual_basic",
        vendorReference: submissionId,
        documents,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("KYC ingestion rejected", { status: response.status });
      return Response.json({ error: "Verification could not be submitted. Try again." }, { status: 502 });
    }

    return Response.json(
      {
        reference: result?.case?.reference,
        status: result?.case?.status ?? "submitted",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("KYC ingestion unavailable", error);
    return Response.json({ error: "Identity service is temporarily unavailable." }, { status: 503 });
  }
}
