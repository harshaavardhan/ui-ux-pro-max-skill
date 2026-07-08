import dns from "dns/promises";
import net from "net";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;

// Block loopback, private, link-local, and unspecified ranges to prevent
// SSRF (e.g. cloud metadata at 169.254.169.254, internal services on 10/8).
function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 0 || p[0] === 127 || p[0] === 10) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local + metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::" ) return true;
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.startsWith("::ffff:")) return isBlockedIp(v.slice(7)); // IPv4-mapped
  return false;
}

export async function importHtmlFromUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw badRequest("that doesn't look like a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw badRequest("only http and https URLs can be imported");

  // Resolve and vet every address the hostname points to.
  let addrs;
  try {
    addrs = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw badRequest("could not resolve that host");
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address)))
    throw badRequest("that URL points to a private or internal address and can't be imported");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: "error", // don't follow redirects (they can bypass the IP check)
      headers: { "User-Agent": "ShareLock-Import/1.0" },
    });
  } catch {
    throw badRequest("could not fetch that URL (network error, redirect, or timeout)");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw badRequest(`the URL returned HTTP ${res.status}`);
  const ctype = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml/i.test(ctype))
    throw badRequest("that URL is not an HTML page");

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw badRequest("that page is larger than the 2 MB import limit");
  return buf.toString("utf8");
}

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}
