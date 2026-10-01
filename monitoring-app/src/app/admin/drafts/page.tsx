"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import DraftDetailModal from "@/components/DraftDetailModal";

interface Draft {
  id: string;
  title: string;
  caption: string;
  accountTarget: string;
  mediaUrl?: string;
  docUrl?: string;
  scheduledAt?: string;
  notes?: string;
  status: string;
  authorUid: string;
  authorEmail?: string;
  reviewNote?: string | null;
  submittedAt?: string | null;
  slaExpiresAt?: string | null;
  updatedAt: string;
  _effectiveStatus: string;
  _daysLeft: number | null;
  _isExpired: boolean;
}

function badge(status: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    draft: { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8" },
    pending: { bg: "rgba(59,130,246,0.15)", fg: "#60a5fa" },
    approved: { bg: "rgba(16,185,129,0.15)", fg: "#10b981" },
    rejected: { bg: "rgba(239,68,68,0.15)", fg: "#ef4444" },
    published: { bg: "rgba(147,51,234,0.15)", fg: "#a855f7" },
    expired: { bg: "rgba(100,116,139,0.2)", fg: "#64748b" },
  };
  const c = map[status] || map.draft;
  return (
    <span style={{ padding: "4px 10px", background: c.bg, color: c.fg, borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

export default function AdminDraftsPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [selected, setSelected] = useState<Draft | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      let token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json", ...(init?.headers || {}) };
      if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      let res = await fetch(url, { ...init, headers, cache: "no-store" });
      if (res.status === 401) {
        token = await getToken(true);
        if (token) {
          (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
          res = await fetch(url, { ...init, headers, cache: "no-store" });
        }
        if (res.status === 401) router.replace("/login");
      }
      return res;
    },
    [getToken, router]
  );

  const parseJson = async (res: Response) => {
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`API ${res.status}: body bukan JSON (potongan: ${text.slice(0, 120)})`);
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${data.error || "gagal"}${data.details ? " — " + String(data.details).slice(0, 300) : ""}`);
    return data;
  };

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filter !== "semua") params.set("status", filter);
      if (expiringOnly) params.set("expiring", "true");
      const res = await authFetch(`/api/drafts?${params.toString()}`);
      const data = await parseJson(res);
      setDrafts(data.drafts || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, filter, expiringOnly, authFetch, router]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (d: Draft, action: "approve" | "reject") => {
    if (d.authorUid === user?.uid) {
      alert("Tidak bisa memvalidasi karya sendiri — minta admin lain.");
      return;
    }
    let reviewNote = "";
    if (action === "reject") {
      reviewNote = prompt("Alasan reject (wajib):") || "";
      if (!reviewNote.trim()) {
        alert("reviewNote wajib diisi saat reject");
        return;
      }
    } else {
      reviewNote = prompt("Catatan approve (opsional):") || "";
    }
    if (!confirm(`${action === "approve" ? "Approve" : "Reject"} "${d.title}"?`)) return;
    try {
      const res = await authFetch(`/api/drafts/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, reviewNote }),
      });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal: " + e.message);
    }
  };

  const publish = async (d: Draft) => {
    if (!confirm(`Publish "${d.title}"?`)) return;
    try {
      const res = await authFetch(`/api/drafts/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "publish" }),
      });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal publish: " + e.message);
    }
  };

  const remove = async (d: Draft) => {
    if (!confirm(`Hapus permanen "${d.title}"?`)) return;
    try {
      const res = await authFetch(`/api/drafts/${d.id}`, { method: "DELETE" });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal hapus: " + e.message);
    }
  };

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Review Draf</h1>
        </div>
        <button className="btn" onClick={load} style={{ background: "rgba(255,255,255,0.08)" }}>↻ Muat ulang</button>
      </header>

      <div className="tab-row" style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        {(["pending", "approved", "rejected", "published", "expired", "semua"] as const).map((f) => (
          <button
            key={f}
            className="btn"
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px",
              fontSize: "0.8rem",
              textTransform: "capitalize",
              background: filter === f ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)",
              border: filter === f ? "1px solid rgba(59,130,246,0.5)" : "1px solid transparent",
            }}
          >
            {f}
          </button>
        ))}
        <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px", marginLeft: "8px" }}>
          <input type="checkbox" checked={expiringOnly} onChange={(e) => setExpiringOnly(e.target.checked)} />
          Sisa ≤ 2 hari saja
        </label>
      </div>

      {/* Pengganti tab di HP: dropdown status + filter mendesak */}
      <div className="tab-mobile" style={{ gap: "10px", marginBottom: "16px", alignItems: "center" }}>
        <select
          className="input-field"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          style={{ flex: 1, textTransform: "capitalize" }}
          aria-label="Filter status review"
        >
          {(["pending", "approved", "rejected", "published", "expired", "semua"] as const).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={expiringOnly} onChange={(e) => setExpiringOnly(e.target.checked)} />
          ≤ 2 hari
        </label>
      </div>

      {loading && <div className="glass-panel" style={{ padding: "24px" }}>Memuat antrian…</div>}
      {error && <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)" }}>{error}</div>}

      {!loading && !error && (
        <div className="glass-panel" style={{ padding: "24px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Draf / Pengaju</th>
                <th>Target</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center" }}>Tidak ada draf pada filter ini.</td></tr>
              )}
              {drafts.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} title="Klik untuk lihat detail lengkap" style={{ cursor: "pointer", ...(d._effectiveStatus === "pending" && (d._daysLeft ?? 99) <= 2 ? { background: "rgba(239,68,68,0.05)" } : {}) }}>
                  <td>
                    <div style={{ fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>{d.title}</div>
                    <div title={d.caption} style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "380px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.caption}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      {d.authorEmail || d.authorUid}
                      {d.authorUid === user?.uid && <span style={{ color: "var(--danger)" }}> • karya sendiri (tak bisa review)</span>}
                    </div>
                    {d.reviewNote && (
                      <div style={{ fontSize: "0.78rem", marginTop: "4px" }}>Catatan: {d.reviewNote}</div>
                    )}
                    <div style={{ fontSize: "0.75rem", marginTop: "4px", display: "flex", gap: "8px" }}>
                      {d.mediaUrl && <a href={d.mediaUrl} target="_blank" rel="noreferrer">🔗 media</a>}
                      {d.docUrl && <a href={d.docUrl} target="_blank" rel="noreferrer">📄 dokumen</a>}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>{d.accountTarget}</td>
                  <td>{badge(d._effectiveStatus)}</td>
                  <td style={{ fontSize: "0.8rem", fontWeight: d._effectiveStatus === "pending" && (d._daysLeft ?? 99) <= 2 ? 700 : 400, color: d._effectiveStatus === "pending" && (d._daysLeft ?? 99) <= 2 ? "var(--danger)" : undefined }}>
                    {d._effectiveStatus === "pending" && d._daysLeft !== null
                      ? (d._daysLeft < 0 ? "lewat" : `sisa ${d._daysLeft} hari`)
                      : "-"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn" style={{ padding: "5px 10px", background: "rgba(59,130,246,0.15)" }} onClick={() => setSelected(d)}>Detail</button>
                      {d._effectiveStatus === "pending" && (
                        <>
                          <button className="btn" style={{ padding: "5px 10px", background: "rgba(16,185,129,0.15)", color: "var(--success)" }} onClick={() => review(d, "approve")}>Approve</button>
                          <button className="btn btn-danger" style={{ padding: "5px 10px" }} onClick={() => review(d, "reject")}>Reject</button>
                        </>
                      )}
                      {d._effectiveStatus === "approved" && (
                        <button className="btn btn-primary" style={{ padding: "5px 10px" }} onClick={() => publish(d)}>Publish</button>
                      )}
                      {(d._effectiveStatus === "expired" || d._effectiveStatus === "rejected" || d._effectiveStatus === "published") && (
                        <button className="btn" style={{ padding: "5px 10px", background: "rgba(255,255,255,0.08)" }} onClick={() => remove(d)}>Hapus</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && <DraftDetailModal draft={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
