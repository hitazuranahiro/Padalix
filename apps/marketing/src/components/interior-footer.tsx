import Link from "next/link";
import { Brand } from "@/components/brand";

export function InteriorFooter({ appUrl }: { appUrl: string }) {
  return <footer className="site-footer"><Link href="/" aria-label="Padalix home"><Brand /></Link><p>CRYPTO TO CASH, INSTANTLY CONNECTED.</p><div className="footer-links"><Link href="/about">About</Link><Link href="/presentation">Presentation</Link><Link href="/docs">Docs</Link><Link href="/help">Help</Link><Link href="/status">Status</Link><a href={appUrl}>Launch app</a></div><p className="mono">© 2026 PADALIX / BUILT ON STELLAR</p></footer>;
}
