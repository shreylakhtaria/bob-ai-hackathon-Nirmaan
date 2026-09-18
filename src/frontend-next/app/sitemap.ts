import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the two pages a crawler can actually reach. Every other route
  // (overview, assets, crews, ...) is behind the login gate, so listing them
  // would just fill Search Console with blocked URLs.
  return [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/login`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
