const configuredMediaURL =
  process.env.NEXT_PUBLIC_MEDIA_CDN_ENABLED === "true"
    ? process.env.NEXT_PUBLIC_MEDIA_URL?.trim().replace(/\/+$/, "")
    : undefined;

export function mediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.replace(/^\/+/, "");
  return configuredMediaURL
    ? `${configuredMediaURL}/${normalizedPath}`
    : `/${normalizedPath}`;
}
