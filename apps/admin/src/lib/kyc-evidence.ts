import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import {
  customerDocumentTypes,
  evidencePolicy,
  extensionForMimeType,
  validateEvidenceFile,
  type CustomerDocumentType,
  type EvidenceFileInput,
  type EvidenceMimeType,
} from "@/lib/kyc-evidence-policy";
import {
  createEvidenceUpload,
  createEvidenceViewUrl,
  hashSourceIp,
  inspectEvidenceObject,
} from "@/lib/kyc-evidence-storage";

type AuditContext = { sourceIp?: string | null; userAgent?: string | null };
type EvidenceObjectRow = {
  id: string;
  session_id: string;
  case_id: string | null;
  evidence_role: EvidenceFileInput["role"];
  document_type: string;
  storage_bucket: string;
  storage_key: string;
  original_filename: string;
  mime_type: EvidenceMimeType;
  declared_size_bytes: string | number;
  checksum_sha256: string;
  upload_status: string;
};

async function audit(
  client: PoolClient,
  input: {
    objectId?: string | null;
    sessionId?: string | null;
    caseId?: string | null;
    actorType: "member" | "reviewer" | "administrator" | "system";
    actorId?: string | null;
    action:
      | "upload_intent"
      | "upload_finalize"
      | "view_intent"
      | "metadata_view"
      | "access_denied";
    purpose: string;
    outcome: "allowed" | "denied" | "failed";
    context?: AuditContext;
    metadata?: object;
  },
) {
  await client.query(
    `insert into compliance.kyc_evidence_access_audit
      (evidence_object_id,session_id,case_id,actor_type,actor_id,action,purpose,outcome,source_ip,user_agent,metadata)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.objectId ?? null,
      input.sessionId ?? null,
      input.caseId ?? null,
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.purpose,
      input.outcome,
      hashSourceIp(input.context?.sourceIp ?? null),
      input.context?.userAgent?.slice(0, 500) ?? null,
      input.metadata ?? {},
    ],
  );
}

export async function createEvidenceSession(
  input: {
    authSubject: string;
    email: string;
    fullName: string;
    countryCode: string;
    documentType: CustomerDocumentType;
    files: EvidenceFileInput[];
  },
  context: AuditContext,
) {
  if (
    !customerDocumentTypes.includes(input.documentType) ||
    !/^[A-Z]{2}$/.test(input.countryCode)
  )
    throw new Error("Invalid identity evidence request.");
  if (
    input.files.length !== 2 ||
    new Set(input.files.map((file) => file.role)).size !== 2 ||
    !input.files.some((file) => file.role === "identity_document") ||
    !input.files.some((file) => file.role === "selfie")
  ) {
    throw new Error("An identity document and selfie are required.");
  }
  for (const file of input.files) {
    const validationError = validateEvidenceFile(file);
    if (validationError) throw new Error(validationError);
  }

  const recentSessions = await database.query<{ count: string }>(
    `select count(*)::text as count from compliance.kyc_evidence_session
      where auth_subject=$1 and created_at > now()-interval '15 minutes'
        and expires_at > now() and status in ('pending','finalizing')`,
    [input.authSubject],
  );
  if (Number(recentSessions.rows[0]?.count ?? 0) >= 5) {
    throw new Error("Too many active identity evidence sessions.");
  }

  const sessionId = randomUUID();
  const year = new Date().getUTCFullYear();
  const objects = await Promise.all(
    input.files.map(async (file) => {
      const objectId = randomUUID();
      const key = `kyc-evidence/${year}/${sessionId}/${file.role}-${objectId}.${extensionForMimeType(file.mimeType as EvidenceMimeType)}`;
      const upload = await createEvidenceUpload({
        key,
        mimeType: file.mimeType as EvidenceMimeType,
        sizeBytes: file.sizeBytes,
        checksumSha256: file.checksumSha256,
      });
      return { ...file, objectId, key, upload };
    }),
  );

  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into compliance.kyc_evidence_session
        (id,auth_subject,email,full_name,country_code,document_type,expires_at)
       values($1,$2,$3,$4,$5,$6,now()+($7 * interval '1 second'))`,
      [
        sessionId,
        input.authSubject,
        input.email,
        input.fullName,
        input.countryCode,
        input.documentType,
        evidencePolicy.sessionSeconds,
      ],
    );
    for (const object of objects) {
      const documentType =
        object.role === "selfie" ? "selfie" : input.documentType;
      await client.query(
        `insert into compliance.kyc_evidence_object
          (id,session_id,evidence_role,document_type,storage_bucket,storage_key,original_filename,mime_type,declared_size_bytes,checksum_sha256)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          object.objectId,
          sessionId,
          object.role,
          documentType,
          object.upload.bucket,
          object.key,
          object.filename,
          object.mimeType,
          object.sizeBytes,
          object.checksumSha256,
        ],
      );
      await audit(client, {
        objectId: object.objectId,
        sessionId,
        actorType: "member",
        actorId: input.authSubject,
        action: "upload_intent",
        purpose: "kyc_submission",
        outcome: "allowed",
        context,
        metadata: {
          role: object.role,
          expiresInSeconds: evidencePolicy.uploadUrlSeconds,
        },
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return {
    sessionId,
    expiresInSeconds: evidencePolicy.sessionSeconds,
    uploads: objects.map((object) => ({
      objectId: object.objectId,
      role: object.role,
      url: object.upload.url,
      headers: object.upload.headers,
    })),
  };
}

export async function finalizeEvidenceSession(
  sessionId: string,
  authSubject: string,
  context: AuditContext,
) {
  const existing = await database.query(
    `select s.*,json_agg(o order by o.evidence_role) as objects
       from compliance.kyc_evidence_session s
       join compliance.kyc_evidence_object o on o.session_id=s.id
      where s.id=$1 and s.auth_subject=$2 group by s.id`,
    [sessionId, authSubject],
  );
  if (!existing.rowCount) throw new Error("Evidence session was not found.");
  const session = existing.rows[0];
  if (session.status === "finalized" && session.case_id) {
    const result = await database.query(
      "select reference,status from compliance.kyc_case where id=$1",
      [session.case_id],
    );
    return result.rows[0];
  }
  if (
    session.status !== "pending" ||
    new Date(session.expires_at) <= new Date()
  )
    throw new Error("Evidence session has expired or is no longer available.");
  const objects = session.objects as EvidenceObjectRow[];

  const inspections = await Promise.all(
    objects.map(async (object) => ({
      object,
      stored: await inspectEvidenceObject(object.storage_key),
    })),
  );
  const invalid = inspections.find(
    ({ object, stored }) =>
      stored.bucket !== object.storage_bucket ||
      stored.sizeBytes !== Number(object.declared_size_bytes) ||
      stored.mimeType !== object.mime_type ||
      stored.checksumSha256 !== object.checksum_sha256 ||
      stored.storageChecksumSha256 !==
        Buffer.from(object.checksum_sha256, "hex").toString("base64"),
  );
  if (invalid) {
    const client = await database.connect();
    try {
      await client.query("begin");
      await client.query(
        "update compliance.kyc_evidence_session set status='rejected',updated_at=now() where id=$1 and status='pending'",
        [sessionId],
      );
      await client.query(
        "update compliance.kyc_evidence_object set upload_status='rejected',rejection_reason='storage_metadata_mismatch',updated_at=now() where id=$1",
        [invalid.object.id],
      );
      await audit(client, {
        objectId: invalid.object.id,
        sessionId,
        actorType: "member",
        actorId: authSubject,
        action: "upload_finalize",
        purpose: "kyc_submission",
        outcome: "denied",
        context,
        metadata: { reason: "storage_metadata_mismatch" },
      });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    throw new Error("Uploaded evidence did not pass integrity validation.");
  }

  const client = await database.connect();
  try {
    await client.query("begin");
    const locked = await client.query(
      "select * from compliance.kyc_evidence_session where id=$1 and auth_subject=$2 for update",
      [sessionId, authSubject],
    );
    if (
      !locked.rowCount ||
      locked.rows[0].status !== "pending" ||
      new Date(locked.rows[0].expires_at) <= new Date()
    )
      throw new Error(
        "Evidence session has expired or is no longer available.",
      );
    await client.query(
      "update compliance.kyc_evidence_session set status='finalizing',updated_at=now() where id=$1",
      [sessionId],
    );
    const member = await client.query(
      `insert into identity.member(id,auth_subject,email,full_name,country_code,email_verified)
       values($1,$2,$3,$4,$5,true)
       on conflict(auth_subject) do update set email=excluded.email,full_name=excluded.full_name,country_code=excluded.country_code,updated_at=now() returning *`,
      [
        randomUUID(),
        authSubject,
        session.email,
        session.full_name,
        session.country_code,
      ],
    );
    const memberRow = member.rows[0];
    await client.query(
      "insert into notification.member_preference(member_id) values($1) on conflict do nothing",
      [memberRow.id],
    );
    const sequence = await client.query(
      "select nextval('compliance.kyc_reference_seq') as value",
    );
    const caseId = randomUUID();
    const reference = `KYC-${new Date().getUTCFullYear()}-${String(sequence.rows[0].value).padStart(6, "0")}`;
    await client.query(
      `insert into compliance.kyc_case(id,reference,member_id,tier,review_due_at)
       values($1,$2,$3,'individual_basic',now()+interval '24 hours')`,
      [caseId, reference, memberRow.id],
    );
    for (const { object, stored } of inspections) {
      await client.query(
        `update compliance.kyc_evidence_object set case_id=$1,verified_size_bytes=$2,storage_checksum_sha256=$3,storage_etag=$4,
          upload_status='verified',uploaded_at=now(),updated_at=now() where id=$5`,
        [
          caseId,
          stored.sizeBytes,
          stored.storageChecksumSha256,
          stored.etag,
          object.id,
        ],
      );
      await client.query(
        `insert into compliance.kyc_document
          (id,case_id,document_type,storage_key,filename,mime_type,checksum_sha256,evidence_object_id)
         values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          caseId,
          object.document_type,
          object.storage_key,
          object.original_filename,
          object.mime_type,
          object.checksum_sha256,
          object.id,
        ],
      );
      await audit(client, {
        objectId: object.id,
        sessionId,
        caseId,
        actorType: "member",
        actorId: authSubject,
        action: "upload_finalize",
        purpose: "kyc_submission",
        outcome: "allowed",
        context,
        metadata: { role: object.evidence_role },
      });
    }
    await client.query(
      "update compliance.kyc_evidence_session set status='finalized',case_id=$1,finalized_at=now(),updated_at=now() where id=$2",
      [caseId, sessionId],
    );
    await client.query(
      "insert into compliance.kyc_event(case_id,actor_type,actor_id,event_type,metadata) values($1,'member',$2,'kyc.submitted',$3)",
      [
        caseId,
        memberRow.id,
        { documentCount: objects.length, evidenceIntegrityVerified: true },
      ],
    );
    await client.query(
      "insert into notification.outbox(member_id,category,template_key,recipient,payload) values($1,'compliance','kyc_submission_received',$2,$3)",
      [memberRow.id, session.email, { reference }],
    );
    await client.query(
      "insert into notification.outbox(member_id,category,template_key,recipient,payload) values(null,'staff','kyc_case_submitted',$1,$2)",
      [
        process.env.KYC_REVIEW_EMAIL ?? "compliance@padalix.com",
        { reference, riskLevel: "unrated" },
      ],
    );
    await client.query("commit");
    return { reference, status: "submitted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function createReviewerEvidenceAccess(
  documentId: string,
  reviewer: { id: string; role: string },
  purpose: string,
  context: AuditContext,
) {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(purpose))
    throw new Error("A valid access purpose is required.");
  const result = await database.query(
    `select o.*,d.id as document_id,c.reference
       from compliance.kyc_document d
       join compliance.kyc_evidence_object o on o.id=d.evidence_object_id
       join compliance.kyc_case c on c.id=d.case_id
      where d.id=$1 and o.upload_status='verified'`,
    [documentId],
  );
  if (!result.rowCount) throw new Error("Verified evidence was not found.");
  const object = result.rows[0] as EvidenceObjectRow & {
    reference: string;
    document_id: string;
  };
  const actorType = reviewer.role === "admin" ? "administrator" : "reviewer";
  try {
    const url = await createEvidenceViewUrl(
      object.storage_key,
      object.original_filename,
    );
    const client = await database.connect();
    try {
      await audit(client, {
        objectId: object.id,
        sessionId: object.session_id,
        caseId: object.case_id,
        actorType,
        actorId: reviewer.id,
        action: "view_intent",
        purpose,
        outcome: "allowed",
        context,
        metadata: { caseReference: object.reference },
      });
    } finally {
      client.release();
    }
    return { url, expiresInSeconds: evidencePolicy.reviewerUrlSeconds };
  } catch (error) {
    const client = await database.connect();
    try {
      await audit(client, {
        objectId: object.id,
        sessionId: object.session_id,
        caseId: object.case_id,
        actorType,
        actorId: reviewer.id,
        action: "view_intent",
        purpose,
        outcome: "failed",
        context,
      });
    } finally {
      client.release();
    }
    throw error;
  }
}
