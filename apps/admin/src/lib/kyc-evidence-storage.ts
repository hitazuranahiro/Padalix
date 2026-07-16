import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  evidencePolicy,
  type EvidenceMimeType,
} from "@/lib/kyc-evidence-policy";

type StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  kmsKeyId?: string;
};

let cachedClient: S3Client | undefined;

function storageConfig(): StorageConfig {
  const bucket = process.env.KYC_EVIDENCE_S3_BUCKET?.trim();
  const region = process.env.KYC_EVIDENCE_S3_REGION?.trim();
  const accessKeyId = process.env.KYC_EVIDENCE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.KYC_EVIDENCE_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("KYC evidence storage is not configured.");
  }
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.KYC_EVIDENCE_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.KYC_EVIDENCE_S3_FORCE_PATH_STYLE === "true",
    kmsKeyId: process.env.KYC_EVIDENCE_S3_KMS_KEY_ID?.trim() || undefined,
  };
}

function client(config: StorageConfig) {
  cachedClient ??= new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return cachedClient;
}

function checksumBase64(checksumHex: string) {
  return Buffer.from(checksumHex, "hex").toString("base64");
}

export async function createEvidenceUpload(input: {
  key: string;
  mimeType: EvidenceMimeType;
  sizeBytes: number;
  checksumSha256: string;
}) {
  const config = storageConfig();
  const checksum = checksumBase64(input.checksumSha256);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.mimeType,
    ContentLength: input.sizeBytes,
    ChecksumSHA256: checksum,
    Metadata: { "padalix-sha256": input.checksumSha256 },
    ServerSideEncryption: config.kmsKeyId ? "aws:kms" : "AES256",
    SSEKMSKeyId: config.kmsKeyId,
  });
  return {
    bucket: config.bucket,
    url: await getSignedUrl(client(config), command, {
      expiresIn: evidencePolicy.uploadUrlSeconds,
    }),
    headers: {
      "content-type": input.mimeType,
      "x-amz-checksum-sha256": checksum,
      "x-amz-meta-padalix-sha256": input.checksumSha256,
      "x-amz-server-side-encryption": config.kmsKeyId ? "aws:kms" : "AES256",
      ...(config.kmsKeyId
        ? { "x-amz-server-side-encryption-aws-kms-key-id": config.kmsKeyId }
        : {}),
    },
  };
}

export async function inspectEvidenceObject(key: string) {
  const config = storageConfig();
  const result = await client(config).send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ChecksumMode: "ENABLED",
    }),
  );
  return {
    bucket: config.bucket,
    sizeBytes: result.ContentLength,
    mimeType: result.ContentType,
    checksumSha256: result.Metadata?.["padalix-sha256"],
    storageChecksumSha256: result.ChecksumSHA256,
    etag: result.ETag?.replaceAll('"', ""),
  };
}

export async function createEvidenceViewUrl(key: string, filename: string) {
  const config = storageConfig();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentDisposition: `inline; filename="${safeFilename}"`,
  });
  return getSignedUrl(client(config), command, {
    expiresIn: evidencePolicy.reviewerUrlSeconds,
  });
}

export function hashSourceIp(value: string | null) {
  if (!value) return null;
  const pepper = process.env.KYC_AUDIT_IP_PEPPER?.trim();
  if (!pepper) throw new Error("KYC audit hashing is not configured.");
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}
