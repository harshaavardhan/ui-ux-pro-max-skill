import "./globals.css";
import Link from "next/link";
import { currentUser } from "@/lib/auth.js";
import { LogoutButton } from "./nav-actions.js";

export const metadata = {
  title: "ShareLock — Send HTML safely",
  description:
    "Share interactive HTML decks between companies with permissions, integrity verification, and zero data leakage.",
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
              <span className="brand-mark">S</span> ShareLock
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
