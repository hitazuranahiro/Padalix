import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";

export default function OfflinePage(){return <main className="offline-page"><div className="auth-brand"><i><b/><b/><b/></i><strong>PADALIX</strong><span>SECURE PAYMENTS</span></div><section><WifiOff size={34}/><p>NETWORK / OFFLINE</p><h1>Connection required.</h1><span>Account balances, verification, recipients, and transfers are available only through a secure live connection.</span><Link href="/"><RefreshCw size={16}/>Try again</Link></section></main>}
