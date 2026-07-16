import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type MediaStorageConfig = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicURL: string;
};

let cachedClient: S3Client | undefined;

function mediaStorageConfig(): MediaStorageConfig {
  const bucket = process.env.MEDIA_S3_BUCKET?.trim();
  const region = process.env.MEDIA_S3_REGION?.trim();
  const endpoint = process.env.MEDIA_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY?.trim();
  const publicURL = process.env.MEDIA_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (
    !bucket ||
    !region ||
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicURL
  ) {
    throw new Error("Public media storage is not configured.");
  }
  const parsedEndpoint = new URL(endpoint);
  const parsedPublicURL = new URL(publicURL);
  if (parsedEndpoint.protocol !== "https:" || parsedPublicURL.protocol !== "https:") {
    throw new Error("Public media storage endpoints must use HTTPS.");
  }
  return {
    bucket,
    region,
    endpoint: parsedEndpoint.origin,
    accessKeyId,
    secretAccessKey,
    publicURL: parsedPublicURL.origin,
  };
}

function mediaClient(config: MediaStorageConfig) {
  cachedClient ??= new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return cachedClient;
}

function safeObjectKey(key: string) {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || !/^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(normalized)) {
    throw new Error("Invalid public media object key.");
  }
  return normalized;
}

export function publicMediaURL(key: string) {
  const config = mediaStorageConfig();
  return `${config.publicURL}/${safeObjectKey(key)}`;
}

export async function uploadPublicMedia(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
  contentDisposition?: string;
}) {
  const config = mediaStorageConfig();
  const key = safeObjectKey(input.key);
  await mediaClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: input.body,
      ContentLength: input.body.byteLength,
      ContentType: input.contentType,
      ContentDisposition: input.contentDisposition,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${config.publicURL}/${key}`;
}
