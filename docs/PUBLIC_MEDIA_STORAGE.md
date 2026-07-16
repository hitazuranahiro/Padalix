# Public Media Storage

Padalix uses the public Cloudflare R2 bucket `padalix-media` through
`https://cdn.padalix.com`. This bucket is limited to public marketing images,
social metadata, icons, and presentation documents. KYC evidence must remain in
the separate private `padalix-kyc-production` bucket.

## Runtime configuration

The marketing Vercel project needs only the public URL:

```dotenv
NEXT_PUBLIC_MEDIA_URL=https://cdn.padalix.com
NEXT_PUBLIC_MEDIA_CDN_ENABLED=false
```

The admin Vercel project owns uploads and needs bucket-scoped server secrets:

```dotenv
MEDIA_S3_BUCKET=padalix-media
MEDIA_S3_REGION=auto
MEDIA_S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
MEDIA_S3_ACCESS_KEY_ID=<media-bucket-access-key>
MEDIA_S3_SECRET_ACCESS_KEY=<media-bucket-secret-key>
MEDIA_PUBLIC_URL=https://cdn.padalix.com
```

Never prefix these credentials with `NEXT_PUBLIC_`. Use an R2 Object Read &
Write token restricted to `padalix-media`; do not reuse the KYC token.

## Initial asset sync

After configuring the variables locally in the shell or secret runner, upload
the existing marketing `public/` assets with:

```bash
pnpm --filter @padalix/admin media:sync
```

The command preserves paths such as `images/padalix-og.png` and
`documents/padalix-idea-submission.pdf`. Run it before deploying marketing with
the CDN enabled, otherwise the CDN paths will return missing objects. Confirm
the objects return HTTP 200, then set `NEXT_PUBLIC_MEDIA_CDN_ENABLED=true` and
redeploy marketing. Until that flag is enabled, marketing retains its bundled
local assets even when `NEXT_PUBLIC_MEDIA_URL` is configured.

New presentation PDFs uploaded through the CMS are written directly to R2
under content-addressed `documents/` keys. PostgreSQL stores the published CDN
URL in site content and no longer receives new PDF bytes. The previous database
asset endpoint remains read-only during migration.
