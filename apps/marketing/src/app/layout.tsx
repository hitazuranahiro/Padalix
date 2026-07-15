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
  applicationName: "Padalix",
  title: {
    default: "Padalix | Money Moves Forward",
    template: "%s | Padalix"
  },
  description: "Padalix connects modern payment infrastructure to clearer, faster cross-border remittances for families and businesses.",
  keywords: ["Padalix", "cross-border payments", "global remittance", "digital payments", "payment infrastructure", "Philippines remittance"],
  authors: [{ name: "Padalix", url: "https://padalix.com" }],
  creator: "Padalix",
  publisher: "Padalix",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 }
  },
  openGraph: {
    siteName: "Padalix",
    title: "Padalix | Money Moves Forward",
    description: "Clearer cross-border payments built for global movement.",
    type: "website",
    url: "https://padalix.com",
    locale: "en_US",
    images: [{ url: "/images/padalix-og.png", width: 1200, height: 630, type: "image/png", alt: "Padalix global payment infrastructure" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Padalix | Money Moves Forward",
    description: "Clearer cross-border payments built for global movement.",
    images: ["/images/padalix-og.png"]
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
