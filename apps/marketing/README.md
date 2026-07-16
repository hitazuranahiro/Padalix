# Padalix Marketing

The public Padalix landing page is a standalone Next.js application intended for `padalix.com`.

The customer product is a separate application and deployment. Marketing links use `NEXT_PUBLIC_APP_URL`, which defaults to `https://app.padalix.com`.

## Local development

From the repository root:

```bash
pnpm install
pnpm dev:marketing
```

## Vercel

Create a Vercel project with:

- Root Directory: `apps/marketing`
- Framework Preset: Next.js
- Environment variable: `NEXT_PUBLIC_APP_URL=https://app.padalix.com`
- Server-only environment variable: `STATUS_API_URL=https://admin.padalix.com/api/status`
- Production domain: `padalix.com`

The future customer PWA should use its own Vercel project and the `app.padalix.com` domain.

`/status` renders measured component health and published incident history. The global incident banner is streamed behind a React Suspense boundary and fails open, so status-feed latency or failure does not hold up marketing page content.

## Content

Landing-page content currently lives in `src/content/site.ts`. The presentation components consume this typed model so the source can later be replaced with the Padalix Go content API without restructuring the page.

Public images and documents resolve through `NEXT_PUBLIC_MEDIA_URL` only when
`NEXT_PUBLIC_MEDIA_CDN_ENABLED=true`. Keep the flag disabled until the initial
`padalix-media` R2 sync described in `../../docs/PUBLIC_MEDIA_STORAGE.md` has
completed; otherwise the bundled `public/` assets remain the fallback.
