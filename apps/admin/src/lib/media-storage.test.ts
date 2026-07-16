import assert from "node:assert/strict";
import test from "node:test";
import { publicMediaURL } from "./media-storage";

const mediaEnvironment = {
  MEDIA_S3_BUCKET: "padalix-media",
  MEDIA_S3_REGION: "auto",
  MEDIA_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
  MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key",
  MEDIA_PUBLIC_URL: "https://cdn.padalix.com/",
};

test("builds a public CDN URL from a safe object key", () => {
  const previous = Object.fromEntries(
    Object.keys(mediaEnvironment).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, mediaEnvironment);
  try {
    assert.equal(
      publicMediaURL("documents/padalix-presentation.pdf"),
      "https://cdn.padalix.com/documents/padalix-presentation.pdf",
    );
    assert.throws(() => publicMediaURL("../private.txt"), /Invalid/);
  } finally {
    for (const name of Object.keys(mediaEnvironment)) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
