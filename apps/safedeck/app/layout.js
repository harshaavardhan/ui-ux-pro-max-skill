import "./globals.css";
import Link from "next/link";
import { currentUser } from "@/lib/auth.js";
import { LogoutButton } from "./nav-actions.js";
import { APP_NAME, SITE_URL } from "@/lib/constants.js";

const TITLE = `${APP_NAME} — Convert HTML to PDF & DOCX (free, private)`;
const DESCRIPTION =
  "Convert HTML to PDF or Word (DOCX) online — free, private, and instant. Paste a link or drop an .html file, no sign-up. Files are encrypted, tamper-evident, and auto-deleted.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "convert html to pdf",
    "html to pdf",
    "html to pdf converter",
    "free html to pdf",
    "convert html to docx",
    "html to word",
    "html to docx converter",
    "convert webpage to pdf",
    "claude artifact to pdf",
    "best html to pdf converter",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  const user = currentUser();
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <div className="topnav-inner">
            <Link href={user ? "/dashboard" : "/"} className="brand">
              <span className="brand-mark">{APP_NAME[0]}</span> {APP_NAME}
            </Link>
            <Link href="/faq" className="small">
              FAQ
            </Link>
            {user && (
              <>
                <Link href="/dashboard" className="small">
                  Artifacts
                </Link>
                <Link href="/labels" className="small">
                  Labels
                </Link>
                <Link href="/outbox" className="small">
                  Dev outbox
                </Link>
              </>
            )}
            <span className="spacer" />
            {user ? (
              <>
                <span className="who">
                  {user.name} · {user.org_name}
                </span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="small">
                  Sign in
                </Link>
                <Link href="/register" className="btn btn-primary btn-sm">
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
