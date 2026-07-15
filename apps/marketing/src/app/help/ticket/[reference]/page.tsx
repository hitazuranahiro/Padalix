import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { InteriorFooter } from "@/components/interior-footer";
import { TicketTracker } from "@/components/ticket-tracker";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";
export const metadata: Metadata = { title: "Support Case | Padalix", robots: { index: false, follow: false } };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ token?: string }> }) {
  const { reference } = await params; const { token = "" } = await searchParams;
  return <><SiteHeader appUrl={appUrl} /><main className="ticket-page"><TicketTracker reference={reference.toUpperCase()} initialToken={token} /></main><InteriorFooter appUrl={appUrl} /></>;
}
