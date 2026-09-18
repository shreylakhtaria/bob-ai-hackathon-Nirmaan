import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// globals.css named IBM Plex and JetBrains Mono for months without either one
// ever being loaded, so every visitor saw the system fallback. IBM Plex is the
// right family for this product rather than a default: it was drawn for
// technical and industrial interfaces, and its mono shares the sans skeleton,
// so figures in a table and prose beside them read as one voice.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

// No fixed production hostname exists yet (see demo/live-demo-url.txt), so rather
// than hardcoding a domain — a wrong canonical is worse than none — this reads
// NEXT_PUBLIC_SITE_URL and falls back to the dev origin. Set it at deploy time and
// every canonical / Open Graph URL below becomes absolute and correct.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const description =
  "Predict grid asset failures, explain the drivers with SHAP, rank them by customer " +
  "impact, simulate outages and dispatch crews — an ML decision-support console for " +
  "electricity utilities.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // Each route supplies its own `title`; this template appends the product name,
  // so every page gets a unique, self-describing tab title without repetition.
  title: {
    default: "Grid Equipment Failure & Outage Advisor",
    template: "%s · Grid Risk Advisor",
  },
  description,
  applicationName: "Grid Risk Advisor",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Grid Risk Advisor",
    title: "Grid Equipment Failure & Outage Advisor",
    description,
    url: "/",
    images: [
      {
        url: "/og-image.png",
        width: 1440,
        height: 900,
        alt: "Grid Risk Advisor operations overview showing grid risk KPIs, critical assets and regional risk exposure.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Grid Equipment Failure & Outage Advisor",
    description,
    images: ["/og-image.png"],
  },
};

// SoftwareApplication, deliberately: this is an authenticated operator console, not
// a business with a location or opening hours, so LocalBusiness would be false
// markup. No ratings or prices are claimed because none exist.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Grid Equipment Failure & Outage Advisor",
  alternateName: "Grid Risk Command Center",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Utility grid asset monitoring and decision support",
  operatingSystem: "Web browser",
  url: siteUrl,
  image: `${siteUrl}/og-image.png`,
  description,
  featureList: [
    "Asset failure prediction",
    "SHAP-based risk driver explanations",
    "Grid Impact Score prioritisation",
    "What-if outage and severe weather simulation",
    "Crew dispatch, scheduling and pre-positioning",
    "Grounded AI operations copilot",
  ],
  author: { "@type": "Organization", name: "Team Nirmaan" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="bg-canvas text-ink antialiased min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
