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
  encryption: "provider" | "AES256" | "aws:kms";
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
  const kmsKeyId = process.env.KYC_EVIDENCE_S3_KMS_KEY_ID?.trim() || undefined;
  const configuredEncryption = process.env.KYC_EVIDENCE_S3_ENCRYPTION?.trim();
  const encryption = configuredEncryption || (kmsKeyId ? "aws:kms" : "AES256");
  if (!(["provider", "AES256", "aws:kms"] as const).includes(encryption as "provider" | "AES256" | "aws:kms")) {
    throw new Error("KYC_EVIDENCE_S3_ENCRYPTION must be provider, AES256, or aws:kms.");
  }
  if (encryption === "aws:kms" && !kmsKeyId) {
    throw new Error("KYC_EVIDENCE_S3_KMS_KEY_ID is required for aws:kms encryption.");
  }
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.KYC_EVIDENCE_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.KYC_EVIDENCE_S3_FORCE_PATH_STYLE === "true",
    encryption: encryption as StorageConfig["encryption"],
    kmsKeyId,
  };
}

function client(config: StorageConfig) {
  cachedClient ??= new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    // Presigned browser uploads do not have a request body at signing time.
    // The SDK's default CRC32 calculation would therefore sign an empty body.
    requestChecksumCalculation: "WHEN_REQUIRED",
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
    ChecksumSHA256:
      config.encryption === "provider" ? undefined : checksum,
    Metadata: { "padalix-sha256": input.checksumSha256 },
    ServerSideEncryption:
      config.encryption === "provider" ? undefined : config.encryption,
    SSEKMSKeyId:
      config.encryption === "aws:kms" ? config.kmsKeyId : undefined,
  });
  const headers = {
    "content-type": input.mimeType,
    ...(config.encryption !== "provider"
      ? { "x-amz-checksum-sha256": checksum }
      : {}),
    "x-amz-meta-padalix-sha256": input.checksumSha256,
    ...(config.encryption !== "provider"
      ? { "x-amz-server-side-encryption": config.encryption }
      : {}),
    ...(config.encryption === "aws:kms" && config.kmsKeyId
      ? { "x-amz-server-side-encryption-aws-kms-key-id": config.kmsKeyId }
      : {}),
  };
  return {
    bucket: config.bucket,
    url: await getSignedUrl(client(config), command, {
      expiresIn: evidencePolicy.uploadUrlSeconds,
      signableHeaders: new Set(["content-type"]),
      unhoistableHeaders: new Set(
        Object.keys(headers).filter((header) => header.startsWith("x-amz-")),
      ),
    }),
    headers,
  };
}

export async function inspectEvidenceObject(key: string) {
  const config = storageConfig();
  const result = await client(config).send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ChecksumMode: config.encryption === "provider" ? undefined : "ENABLED",
    }),
  );
  let storageChecksumSha256 = result.ChecksumSHA256;
  if (config.encryption === "provider") {
    if (!result.ContentLength || result.ContentLength > 10 * 1024 * 1024) {
      throw new Error("Stored evidence size is outside the verification limit.");
    }
    const object = await client(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!object.Body) throw new Error("Stored evidence body is unavailable.");
    const bytes = await object.Body.transformToByteArray();
    if (bytes.byteLength !== result.ContentLength) {
      throw new Error("Stored evidence size changed during verification.");
    }
    storageChecksumSha256 = createHash("sha256")
      .update(bytes)
      .digest("base64");
  }
  return {
    bucket: config.bucket,
    sizeBytes: result.ContentLength,
    mimeType: result.ContentType,
    checksumSha256: result.Metadata?.["padalix-sha256"],
    storageChecksumSha256,
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
