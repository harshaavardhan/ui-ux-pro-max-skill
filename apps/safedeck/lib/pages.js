// Page-wise editing support.
//
// SafeDeck's deck convention: each top-level <section> inside <body> is one
// page. splitPages() carves a full HTML document into an immutable-friendly
// structure { prefix, pages[], suffix } where
//   prefix + pages.join('') + suffix === original document, byte for byte.
// joinPages() reassembles it. Splitting is purely lexical (depth-counted
// <section> scanning) so round-tripping never alters content — critical,
// since versions are hash-fingerprinted.
//
// Pure string functions: usable on both server and client.

const OPEN_RE = /<section\b[^>]*>/gi;
const TAG_RE = /<\/?section\b[^>]*>/gi;

export function splitPages(html) {
  const bodyOpen = html.search(/<body\b[^>]*>/i);
  let scanStart = 0;
  let scanEnd = html.length;
  if (bodyOpen >= 0) {
    scanStart = bodyOpen + html.slice(bodyOpen).match(/<body\b[^>]*>/i)[0].length;
    const bodyClose = html.toLowerCase().lastIndexOf("</body>");
    if (bodyClose > scanStart) scanEnd = bodyClose;
  }

  // Find top-level <section>…</section> ranges within [scanStart, scanEnd).
  const ranges = [];
  TAG_RE.lastIndex = scanStart;
  let depth = 0;
  let openIdx = -1;
  let m;
  while ((m = TAG_RE.exec(html)) && m.index < scanEnd) {
    const isClose = m[0][1] === "/";
    if (!isClose) {
      if (depth === 0) openIdx = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) ranges.push([openIdx, m.index + m[0].length]);
    }
  }

  if (ranges.length === 0 || depth !== 0) {
    // No page structure (or malformed nesting): treat as a single blob.
    return { supported: false, prefix: "", pages: [html], suffix: "" };
  }

  const prefix = html.slice(0, ranges[0][0]);
  const suffix = html.slice(ranges[ranges.length - 1][1]);
  const pages = [];
  for (let i = 0; i < ranges.length; i++) {
    // Include inter-section whitespace/content with the preceding page so
    // reassembly is byte-exact.
    const end = i + 1 < ranges.length ? ranges[i + 1][0] : ranges[i][1];
    pages.push(html.slice(ranges[i][0], Math.max(end, ranges[i][1])));
  }
  return { supported: true, prefix, pages, suffix };
}

export function joinPages({ prefix, pages, suffix }) {
  return prefix + pages.join("") + suffix;
}

// A minimal page skeleton for the "add page" action.
export function blankPage(n) {
  return `\n<section class="page">\n  <h1>Page ${n}</h1>\n  <p>New page — edit me.</p>\n</section>\n`;
}
