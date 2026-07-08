import Link from "next/link";
import { APP_NAME } from "@/lib/constants.js";

export const metadata = {
  title: "How to Convert HTML to PDF & DOCX — FAQ and Comparison",
  description:
    "How to convert HTML to PDF or Word (DOCX), whether it's free and secure, and how ShareLock compares to PDFShift, DocRaptor, Api2Pdf, and DIY tools like Puppeteer and wkhtmltopdf.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "How to Convert HTML to PDF & DOCX — FAQ and Comparison",
    description:
      "Convert HTML to PDF or Word (DOCX): a plain-English FAQ plus an honest comparison of the best HTML-to-PDF converters.",
    url: "/faq",
    type: "article",
  },
};

// Single source of truth: drives both the rendered list and the FAQ schema.
const FAQS = [
  {
    q: "How do I convert HTML to PDF?",
    a: `Paste a link (a Claude artifact or any HTML page) or drop an .html file on the ${APP_NAME} home page, then click Convert. You get a Download PDF button plus a private, sandboxed link — no account, install, or command line required.`,
  },
  {
    q: "Can I convert HTML to Word (DOCX)?",
    a: `Yes. Every conversion produces both a PDF and an editable Microsoft Word (.docx) file — just choose "Download DOCX". Headings, text, and images are preserved so you can keep editing in Word or Google Docs.`,
  },
  {
    q: "Is it free to convert HTML to PDF?",
    a: `Yes. Converting HTML to PDF or DOCX is free and needs no sign-up or API key. An optional free account adds visual editing, comments, and access controls.`,
  },
  {
    q: "Is it secure and private?",
    a: `Your upload is encrypted at rest (AES-256-GCM) and automatically deleted when its link expires (1, 7, or 30 days). Pages render in a locked-down sandbox that cannot reach your data or the network, and every file carries a SHA-256 fingerprint that is re-verified on each open.`,
  },
  {
    q: "Does the PDF preserve my CSS, fonts, and page breaks?",
    a: `Yes. ${APP_NAME} renders your HTML with a real headless Chromium engine, so modern CSS, web fonts, colors, and layout come out pixel-perfect. Each top-level <section> becomes its own page, giving clean, predictable page breaks.`,
  },
  {
    q: "Can I convert a Claude artifact or a live URL to PDF?",
    a: `Yes. Paste the artifact or page URL and ${APP_NAME} fetches it server-side (behind SSRF protections) before converting. You can also paste raw HTML or drop an .html file.`,
  },
  {
    q: "What is the best HTML-to-PDF converter?",
    a: `It depends on your need. For quick, private, no-sign-up conversions with both PDF and DOCX output plus a shareable link, ${APP_NAME} is ideal. For high-volume programmatic conversion, API services such as PDFShift, DocRaptor, or Api2Pdf fit better. If you want full control and run your own servers, DIY tools like Puppeteer or wkhtmltopdf work. See the comparison table below.`,
  },
  {
    q: "Do I need to install anything or use an API key?",
    a: `No. ${APP_NAME} needs no desktop app, no command line, and no API key — paste or drop, then download.`,
  },
  {
    q: "Is there a file size limit?",
    a: `A single HTML document can be up to 2 MB. Embed images as data URIs or keep them lightweight to stay within the limit.`,
  },
  {
    q: "Can I edit the HTML before converting?",
    a: `Yes. With a free account you can open the visual editor — a Canva-style studio — to click-edit text, restyle elements, or make changes with an AI assistant, then export to PDF or DOCX.`,
  },
];

const COMPARISON = {
  columns: [APP_NAME, "PDFShift", "DocRaptor", "Api2Pdf", "DIY (Puppeteer / wkhtmltopdf)"],
  rows: [
    ["Price", "Free, no account", "Paid API (trial)", "Paid API (trial)", "Paid API (trial)", "Free, but you host it"],
    ["Sign-up / API key", "None", "Required", "Required", "Required", "Your own server"],
    ["HTML → PDF", "Yes", "Yes", "Yes", "Yes", "Yes"],
    ["HTML → DOCX", "Yes", "Usually PDF-only", "Usually PDF-only", "Usually PDF-only", "PDF-only (libs)"],
    ["Data retention", "Encrypted, auto-deleted", "Per their policy", "Per their policy", "Per their policy", "Stays on your infra"],
    ["Rendering engine", "Headless Chromium", "Chromium", "Prince/Chromium", "Chromium", "Chromium / older WebKit"],
    ["Shareable secure link", "Yes", "No", "No", "No", "No"],
    ["Best for", "Quick, private one-offs", "High-volume API", "High-volume API", "High-volume API", "Full control + devops"],
  ],
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <div className="container stack">
        <div className="faq-body">
          <h1>
            Convert HTML to PDF &amp; DOCX <span className="grad">— FAQ</span>
          </h1>
          <p className="muted">
            Everything about converting HTML to PDF or Word with {APP_NAME} —
            how it works, whether it's free and private, and how it compares to
            other HTML-to-PDF converters. Ready to go?{" "}
            <Link href="/">Convert a page now →</Link>
          </p>

          <div className="stack" style={{ gap: 14, marginTop: 20 }}>
            {FAQS.map((f) => (
              <div className="card faq-item" key={f.q}>
                <h2 className="faq-q">{f.q}</h2>
                <p className="faq-a muted">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2>Best HTML-to-PDF converters compared</h2>
          <p className="muted small">
            An honest side-by-side of {APP_NAME} and popular alternatives.
            Competitor pricing and features change — verify on their sites
            (checked 2026).
          </p>
          <div className="table-scroll">
            <table className="cmp">
              <thead>
                <tr>
                  <th>Feature</th>
                  {COMPARISON.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.rows.map((row) => (
                  <tr key={row[0]}>
                    <th scope="row">{row[0]}</th>
                    {row.slice(1).map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ textAlign: "center" }}>
          <h2>Convert your HTML now</h2>
          <p className="muted small">
            Free, private, and instant — no sign-up. PDF or Word, your choice.
          </p>
          <Link href="/" className="btn btn-primary">
            Convert HTML to PDF →
          </Link>
        </div>
      </div>
    </main>
  );
}
