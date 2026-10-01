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
  reviewNote?: string | null;
  submittedAt?: string | null;
  slaExpiresAt?: string | null;
  updatedAt: string;
  _effectiveStatus: string;
  _daysLeft: number | null;
  _isExpired: boolean;
}

const EMPTY = { title: "", caption: "", accountTarget: "", mediaUrl: "", docUrl: "", scheduledAt: "", notes: "" };

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

export default function UserDraftsPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("semua");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
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
      const res = await authFetch("/api/drafts?limit=100");
      const data = await parseJson(res);
      setDrafts(data.drafts || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, authFetch, router]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (d: Draft) => {
    setEditing(d);
    setForm({
      title: d.title,
      caption: d.caption,
      accountTarget: d.accountTarget,
      mediaUrl: d.mediaUrl || "",
      docUrl: d.docUrl || "",
      scheduledAt: d.scheduledAt ? d.scheduledAt.slice(0, 16) : "",
      notes: d.notes || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.caption.trim() || !form.accountTarget.trim()) {
      alert("Judul, caption, dan target akun wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        caption: form.caption.trim(),
        accountTarget: form.accountTarget.trim(),
        mediaUrl: form.mediaUrl.trim() || undefined,
        docUrl: form.docUrl.trim() || undefined,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        notes: form.notes.trim() || undefined,
      };
      let res: Response;
      if (editing) {
        res = await authFetch(`/api/drafts/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "update", ...payload }),
        });
      } else {
        res = await authFetch("/api/drafts", { method: "POST", body: JSON.stringify(payload) });
      }
      await parseJson(res);
      setModalOpen(false);
      load();
    } catch (e: any) {
      alert("Gagal menyimpan: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (d: Draft, action: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    try {
      const res = await authFetch(`/api/drafts/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal: " + e.message);
    }
  };

  const doDuplicate = async (d: Draft) => {
    if (!confirm("Duplikat draft ini menjadi draft baru?")) return;
    try {
      const res = await authFetch("/api/drafts", {
        method: "POST",
        body: JSON.stringify({ duplicateFrom: d.id }),
      });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal duplikat: " + e.message);
    }
  };

  const doDelete = async (d: Draft) => {
    if (!confirm("Hapus draft ini permanen?")) return;
    try {
      const res = await authFetch(`/api/drafts/${d.id}`, { method: "DELETE" });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal hapus: " + e.message);
    }
  };

  const visible = drafts.filter((d) => {
    if (filter === "semua") return true;
    if (filter === "aktif") return ["draft", "pending", "approved"].includes(d._effectiveStatus);
    if (filter === "riwayat") return ["rejected", "published", "expired"].includes(d._effectiveStatus);
    return d._effectiveStatus === filter;
  });

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Draf Saya</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111" }}>Buat rencana postingan</p>
        </div>
        <button className="btn" onClick={openCreate} style={{ background: "#38bdf8", color: "white" }}>+ Buat Draf</button>
      </header>

      <div className="tab-row" style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        {(["semua", "aktif", "draft", "pending", "approved", "riwayat", "rejected", "published", "expired"] as const).map((f) => (
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
        <button className="btn" onClick={load} style={{ padding: "6px 14px", fontSize: "0.8rem", background: "rgba(255,255,255,0.06)" }}>
          ↻ Muat ulang
        </button>
      </div>

      {/* Pengganti tab di HP: dropdown status + Muat ulang */}
      <div className="tab-mobile" style={{ gap: "10px", marginBottom: "16px" }}>
        <select
          className="input-field"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          style={{ flex: 1, textTransform: "capitalize" }}
          aria-label="Filter status draf"
        >
          {(["semua", "aktif", "draft", "pending", "approved", "riwayat", "rejected", "published", "expired"] as const).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button className="btn" onClick={load} style={{ padding: "6px 14px", fontSize: "0.8rem", background: "rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
          ↻ Muat ulang
        </button>
      </div>

      {loading && <div className="glass-panel" style={{ padding: "24px" }}>Memuat draf…</div>}
      {error && <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)" }}>{error}</div>}

      {!loading && !error && (
        <div className="glass-panel" style={{ padding: "24px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Target</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center" }}>Belum ada draf. Klik “Buat Draf”.</td></tr>
              )}
              {visible.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} title="Klik untuk lihat detail lengkap" style={{ cursor: "pointer" }}>
                  <td>
                    <div style={{ fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>{d.title}</div>
                    <div title={d.caption} style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "340px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.caption}
                    </div>
                    {d.status === "rejected" && d.reviewNote && (
                      <div style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "4px" }}>Catatan admin: {d.reviewNote}</div>
                    )}
                    <div style={{ fontSize: "0.75rem", marginTop: "4px", display: "flex", gap: "8px" }}>
                      {d.mediaUrl && <a href={d.mediaUrl} target="_blank" rel="noreferrer">🔗 media</a>}
                      {d.docUrl && <a href={d.docUrl} target="_blank" rel="noreferrer">📄 dokumen</a>}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>{d.accountTarget}</td>
                  <td>{badge(d._effectiveStatus)}</td>
                  <td style={{ fontSize: "0.8rem" }}>
                    {d._effectiveStatus === "pending" && d._daysLeft !== null
                      ? (d._daysLeft < 0 ? "lewat" : `sisa ${d._daysLeft} hari`)
                      : "-"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn" style={{ padding: "5px 10px", background: "rgba(59,130,246,0.15)" }} onClick={() => setSelected(d)}>Detail</button>
                      {(d._effectiveStatus === "draft" || d._effectiveStatus === "rejected") && (
                        <>
                          <button className="btn" style={{ padding: "5px 10px", background: "rgba(255,255,255,0.1)" }} onClick={() => openEdit(d)}>Edit</button>
                          <button className="btn btn-primary" style={{ padding: "5px 10px" }} onClick={() => doAction(d, "submit", "Submit ke admin? Setelah submit tidak bisa edit sampai direview.")}>Submit</button>
                          <button className="btn btn-danger" style={{ padding: "5px 10px" }} onClick={() => doDelete(d)}>Hapus</button>
                        </>
                      )}
                      {(d._effectiveStatus === "expired" || d._effectiveStatus === "rejected") && (
                        <button className="btn" style={{ padding: "5px 10px", background: "rgba(16,185,129,0.15)" }} onClick={() => doDuplicate(d)}>Duplikat</button>
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

      {modalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div className="glass-panel" style={{ padding: "28px", width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: "16px" }}>{editing ? "Edit Draf" : "Buat Draf Baru"}</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "16px" }}>
              Simpan teks + link saja. Upload foto/video/PDF ke Google Drive lalu paste link-nya — tidak membebani database.
            </p>
            <form onSubmit={handleSave}>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Judul*
                <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Caption*
                <textarea className="input-field" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} rows={4} maxLength={5000} style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Target akun*
                <input className="input-field" value={form.accountTarget} onChange={(e) => setForm({ ...form, accountTarget: e.target.value })} placeholder="mis. welldrone" style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Link media (Drive/preview, opsional)
                <input className="input-field" value={form.mediaUrl} onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })} placeholder="https://…" style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Link dokumen rencana PDF (opsional)
                <input className="input-field" value={form.docUrl} onChange={(e) => setForm({ ...form, docUrl: e.target.value })} placeholder="https://…" style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Jadwal rencana publish (opsional)
                <input type="datetime-local" className="input-field" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "20px", fontSize: "0.9rem" }}>Catatan (opsional)
                <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginTop: "6px" }} />
              </label>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" className="btn" style={{ background: "rgba(255,255,255,0.1)" }} onClick={() => setModalOpen(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
