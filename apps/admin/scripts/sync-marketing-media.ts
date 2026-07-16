import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const required = [
  "MEDIA_S3_BUCKET",
  "MEDIA_S3_REGION",
  "MEDIA_S3_ENDPOINT",
  "MEDIA_S3_ACCESS_KEY_ID",
  "MEDIA_S3_SECRET_ACCESS_KEY",
] as const;

for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const publicDirectory = resolve(process.cwd(), "../marketing/public");
const types: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

const client = new S3Client({
  region: process.env.MEDIA_S3_REGION!,
  endpoint: process.env.MEDIA_S3_ENDPOINT!,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY!,
  },
});

for (const path of await files(publicDirectory)) {
  const contentType = types[extname(path).toLowerCase()];
  if (!contentType) continue;
  const key = relative(publicDirectory, path).split(sep).join("/");
  const body = await readFile(path);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.MEDIA_S3_BUCKET!,
      Key: key,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: contentType,
      CacheControl: "public, max-age=3600, stale-while-revalidate=86400",
    }),
  );
  process.stdout.write(`uploaded ${key}\n`);
}
