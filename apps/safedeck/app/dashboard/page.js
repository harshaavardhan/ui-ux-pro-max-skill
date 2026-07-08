import Link from "next/link";
import { redirect } from "next/navigation";
import db from "@/lib/db.js";
import { currentUser } from "@/lib/auth.js";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const user = currentUser();
  if (!user) redirect("/login");

  const artifacts = db
    .prepare(
      `SELECT a.id, a.title, a.created_at, u.name AS owner_name,
              v.version_number, v.sha256, v.created_at AS updated_at,
              CASE WHEN a.owner_id = @uid THEN 'owner' ELSE p.role END AS role
       FROM artifacts a
       JOIN users u ON u.id = a.owner_id
       LEFT JOIN versions v ON v.id = a.current_version_id
       LEFT JOIN permissions p ON p.artifact_id = a.id AND p.user_id = @uid
       WHERE a.owner_id = @uid OR p.user_id = @uid
       ORDER BY COALESCE(v.created_at, a.created_at) DESC`
    )
    .all({ uid: user.id });

  return (
    <main className="page">
      <div className="container stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>Artifacts</h1>
            <p className="muted small" style={{ margin: 0 }}>
              {user.org_name} · org join code:{" "}
              <span className="mono">{user.org_join_code}</span>{" "}
              <span className="muted">(teammates use this to register)</span>
            </p>
          </div>
          <Link href="/" className="btn btn-primary">
            + Add
          </Link>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {artifacts.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center" }} className="muted">
              No artifacts yet. Create one to replace your next deck.
            </div>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Owner</th>
                  <th>Your role</th>
                  <th>Version</th>
                  <th>Fingerprint</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/artifacts/${a.id}`} style={{ fontWeight: 600 }}>
                        {a.title}
                      </Link>
                    </td>
                    <td className="muted">{a.owner_name}</td>
                    <td>
                      <span className={`badge ${a.role === "owner" ? "badge-info" : "badge-muted"}`}>
                        {a.role}
                      </span>
                    </td>
                    <td className="muted">v{a.version_number || "—"}</td>
                    <td className="mono muted">{(a.sha256 || "").slice(0, 12)}</td>
                    <td className="muted small">{a.updated_at || a.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
