// PDF/DOCX download pair — the single home for export affordances.
// variant="lg" renders prominent primary buttons with full labels (used on
// the homepage success card); the default is a compact secondary pair.
export function ExportButtons({ artifactId, versionId, linkToken, variant }) {
  const params = new URLSearchParams({ artifact: artifactId });
  if (versionId) params.set("version", versionId);
  if (linkToken) params.set("link", linkToken);
  const q = params.toString();
  const lg = variant === "lg";
  const cls = lg ? "btn btn-primary" : "btn btn-secondary btn-sm";
  return (
    <>
      <a className={cls} href={`/api/export/pdf?${q}`}>
        {lg ? "Download PDF" : "↓ PDF"}
      </a>
      <a className={cls} href={`/api/export/docx?${q}`}>
        {lg ? "Download DOCX" : "↓ DOCX"}
      </a>
    </>
  );
}
