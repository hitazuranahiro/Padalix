"use client";

import { Download, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isInstalledPwa } from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "padalix-pwa-install-dismissed";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaBootstrap() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAppleGuide, setShowAppleGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      } else {
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        ).catch(() => undefined);
        if ("caches" in window) {
          caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key.startsWith("padalix-shell-")).map((key) => caches.delete(key)),
          )).catch(() => undefined);
        }
      }
    }
    if (isInstalledPwa()) return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const applePromptTimer = isAppleMobile() ? window.setTimeout(() => setVisible(true), 0) : undefined;

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const handleInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      if (applePromptTimer) window.clearTimeout(applePromptTimer);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) {
      setShowAppleGuide(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setInstallEvent(null);
  };

  return <aside className="pwa-install" aria-label="Install Padalix">
    <div className="pwa-install-mark" aria-hidden="true"><i><b/><b/><b/></i></div>
    <div className="pwa-install-copy">
      <strong>Install Padalix</strong>
      <span>{showAppleGuide ? <>Tap <Share2 size={13}/> Share, then Add to Home Screen.</> : "Open your account from your home screen."}</span>
    </div>
    {!showAppleGuide&&<button className="pwa-install-action" onClick={install}><Download size={16}/>Install</button>}
    <button className="pwa-install-close" onClick={dismiss} aria-label="Dismiss install prompt" title="Dismiss"><X size={16}/></button>
  </aside>;
}
