import type { Metadata } from "next";
import { mediaUrl } from "@/lib/media";

export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      images: [{ url: mediaUrl("images/padalix-og.png"), width: 1200, height: 630, type: "image/png", alt: "Padalix global payment infrastructure" }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [mediaUrl("images/padalix-og.png")]
    }
  };
}
