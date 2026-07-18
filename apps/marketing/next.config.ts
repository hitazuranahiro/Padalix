import type { NextConfig } from "next";

const mediaURL = process.env.NEXT_PUBLIC_MEDIA_CDN_ENABLED === "true"
  ? process.env.NEXT_PUBLIC_MEDIA_URL?.trim().replace(/\/+$/, "")
  : undefined;
const mediaOrigin = mediaURL ? new URL(mediaURL).origin : "";

const scriptSources = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const connectSources = process.env.NODE_ENV === "development"
  ? "connect-src 'self' https://admin.padalix.com http://localhost:* ws://localhost:*"
  : "connect-src 'self' https://admin.padalix.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  scriptSources,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  connectSources,
  `frame-src 'self'${mediaOrigin ? ` ${mediaOrigin}` : ""}`,
  `media-src 'self' blob:${mediaOrigin ? ` ${mediaOrigin}` : ""}`,
  "worker-src 'self' blob:",
].join("; ");
const embeddedDocumentSecurityPolicy = contentSecurityPolicy.replace(
  "frame-ancestors 'none'",
  "frame-ancestors 'self'",
);

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: mediaURL ? [new URL("/**", `${mediaURL}/`)] : [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
      {
        source: "/documents/padalix-pitch-deck.pdf",
        headers: [
          { key: "Content-Security-Policy", value: embeddedDocumentSecurityPolicy },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Disposition", value: "inline; filename=\"padalix-pitch-deck.pdf\"" },
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
