"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";

type AnnouncementNoticeProps = {
  announcement: {
    slug: string;
    eyebrow: string;
    title: string;
    summary: string;
    imageUrl: string;
    statusLabel: string;
    actionLabel: string;
    actionHref: string;
  };
};

export function AnnouncementNotice({ announcement }: AnnouncementNoticeProps) {
  const [visible, setVisible] = useState(false);
  const storageKey = `padalix:announcement:${announcement.slug}`;

  useEffect(() => {
    if (window.localStorage.getItem(storageKey) === "dismissed") return;
    const timer = window.setTimeout(() => setVisible(true), 700);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  function dismiss() {
    window.localStorage.setItem(storageKey, "dismissed");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className="announcement-notice" aria-label="Padalix announcement">
      <div className="announcement-notice-image">
        <Image src={announcement.imageUrl} alt="APAC Stellar Demo Day Philippines event poster" fill sizes="(max-width: 700px) 100vw, 390px" />
      </div>
      <div className="announcement-notice-copy">
        <div className="announcement-notice-meta mono">
          <span>{announcement.eyebrow}</span>
          <span>{announcement.statusLabel}</span>
        </div>
        <h2>{announcement.title}</h2>
        <p>{announcement.summary}</p>
        <Link href={announcement.actionHref}>
          <span>{announcement.actionLabel}</span>
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
      <button type="button" aria-label="Dismiss announcement" onClick={dismiss}>
        <X aria-hidden="true" size={18} />
      </button>
    </aside>
  );
}
