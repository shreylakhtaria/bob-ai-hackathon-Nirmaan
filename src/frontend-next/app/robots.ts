import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    // The console sits behind a login, so the only crawlable surface is the entry
    // page; the JSON API should never be crawled. To keep the app out of search
    // results entirely, change allow to "" and disallow to "/".
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
