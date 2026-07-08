// PDF/DOC download pair — the single home for export affordances.
export function ExportButtons({ artifactId, versionId, linkToken }) {
  const params = new URLSearchParams({ artifact: artifactId });
  if (versionId) params.set("version", versionId);
  if (linkToken) params.set("link", linkToken);
  const q = params.toString();
  return (
    <>
      <a className="btn btn-secondary btn-sm" href={`/api/export/pdf?${q}`}>
        ↓ PDF
      </a>
      <a className="btn btn-secondary btn-sm" href={`/api/export/docx?${q}`}>
        ↓ DOC
      </a>
    </>
  );
}
