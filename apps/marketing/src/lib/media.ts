export function mediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.replace(/^\/+/, "");
  return `/${normalizedPath}`;
}

export function presentationDocumentUrl(path: string) {
  const resolved = mediaUrl(path);
  try {
    const url = new URL(resolved, "https://padalix.com");
    if (url.pathname === "/api/assets/presentation") {
      return "/documents/padalix-idea-submission.pdf";
    }
  } catch {
    return "/documents/padalix-idea-submission.pdf";
  }
  return resolved;
}
