import { SITE_URL } from "@/lib/constants.js";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in surfaces and API routes: nothing to index.
      disallow: ["/api/", "/dashboard", "/artifacts/", "/outbox", "/labels"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
