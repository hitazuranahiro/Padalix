import type { Metadata, Viewport } from "next";
import { DM_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap"
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://padalix.com"),
  title: "Padalix — Money moves forward.",
  description: "Padalix connects stablecoin settlement to practical remittances for Filipino families.",
  openGraph: {
    title: "Padalix — Money moves forward.",
    description: "A clearer, faster remittance system built on Stellar.",
    type: "website",
    url: "https://padalix.com",
    images: [{ url: "/images/padalix-airport-hero.png", width: 1672, height: 941, alt: "Padalix global remittance" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Padalix — Money moves forward.",
    description: "A clearer, faster remittance system built on Stellar.",
    images: ["/images/padalix-airport-hero.png"]
  }
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
