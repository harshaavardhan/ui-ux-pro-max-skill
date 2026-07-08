import { currentUser } from "@/lib/auth.js";
import { QuickShare } from "./quick-share.js";
import { APP_NAME, SITE_URL } from "@/lib/constants.js";

export const dynamic = "force-dynamic";

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: APP_NAME,
      url: SITE_URL,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any (web-based)",
      description:
        "Convert HTML to PDF or Word (DOCX) online — free, private, and instant. Paste a link or drop an .html file, no sign-up required.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Convert HTML to PDF",
        "Convert HTML to Word (DOCX)",
        "Convert a Claude artifact or URL to PDF",
        "Encrypted, auto-deleted files",
        "Sandboxed, tamper-evident sharing links",
      ],
    },
    { "@type": "WebSite", name: APP_NAME, url: SITE_URL },
  ],
};

export default function Home() {
  const user = currentUser();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <QuickShare loggedIn={Boolean(user)} />
    </>
  );
}
