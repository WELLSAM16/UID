"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import PressDraftDetailModal from "@/components/PressDraftDetailModal";

interface PressDraft {
  id: string;
  title: string;
  body: string;
  mediaUrl?: string;
  notes?: string;
  what?: string;
  who?: string;
  when?: string;
  where?: string;
  why?: string;
  how?: string;
  status: string;
  reviewNote?: string | null;
  submittedAt?: string | null;
  slaExpiresAt?: string | null;
  updatedAt: string;
  _effectiveStatus: string;
  _daysLeft: number | null;
  _isExpired: boolean;
}

const EMPTY = { title: "", body: "", mediaUrl: "", notes: "", what: "", who: "", when: "", where: "", why: "", how: "" };

const W5H1_FIELDS = [
  { key: "what", label: "What — Apa peristiwanya?", placeholder: "Contoh: PLN meresmikan 10 SPKLU baru…" },
  { key: "who", label: "Who — Siapa + apa peran PLN?", placeholder: "Contoh: PLN UID Jakarta berperan sebagai pelaksana…" },
  { key: "when", label: "When — Kapan?", placeholder: "Contoh: Selasa, 23 Sep 2026…" },
  { key: "where", label: "Where — Di mana?", placeholder: "Contoh: Kantor PLN Cempaka Putih, Jakarta…" },
  { key: "why", label: "Why — Mengapa penting?", placeholder: "Contoh: Mendukung transisi energi dan kemudahan pelanggan…" },
  { key: "how", label: "How — Bagaimana proses / dampaknya?", placeholder: "Contoh: Dikerjakan 2 tahap, memberi manfaat ke…" },
] as const;

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

export default function PressDraftsPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [drafts, setDrafts] = useState<PressDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("semua");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PressDraft | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<PressDraft | null>(null);

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
      const res = await authFetch("/api/press-drafts?limit=100");
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

  const openEdit = (d: PressDraft) => {
    setEditing(d);
    setForm({
      title: d.title,
      body: d.body,
      mediaUrl: d.mediaUrl || "",
      notes: d.notes || "",
      what: d.what || "",
      who: d.who || "",
      when: d.when || "",
      where: d.where || "",
      why: d.why || "",
      how: d.how || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      alert("Judul dan isi press release wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        body: form.body.trim(),
        mediaUrl: form.mediaUrl.trim() || undefined,
        notes: form.notes.trim() || undefined,
        what: form.what.trim() || undefined,
        who: form.who.trim() || undefined,
        when: form.when.trim() || undefined,
        where: form.where.trim() || undefined,
        why: form.why.trim() || undefined,
        how: form.how.trim() || undefined,
      };
      let res: Response;
      if (editing) {
        res = await authFetch(`/api/press-drafts/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "update", ...payload }),
        });
      } else {
        res = await authFetch("/api/press-drafts", { method: "POST", body: JSON.stringify(payload) });
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

  const doAction = async (d: PressDraft, action: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    try {
      const res = await authFetch(`/api/press-drafts/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal: " + e.message);
    }
  };

  const doDuplicate = async (d: PressDraft) => {
    if (!confirm("Duplikat draft ini menjadi draft baru?")) return;
    try {
      const res = await authFetch("/api/press-drafts", {
        method: "POST",
        body: JSON.stringify({ duplicateFrom: d.id }),
      });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal duplikat: " + e.message);
    }
  };

  const doDelete = async (d: PressDraft) => {
    if (!confirm("Hapus draft ini permanen?")) return;
    try {
      const res = await authFetch(`/api/press-drafts/${d.id}`, { method: "DELETE" });
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
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Draf Press Release</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111" }}>Ajukan rencana siaran pers</p>
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
                <th>Status</th>
                <th>SLA</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center" }}>Belum ada draf. Klik “Buat Draf”.</td></tr>
              )}
              {visible.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} title="Klik untuk lihat detail lengkap" style={{ cursor: "pointer" }}>
                  <td>
                    <div style={{ fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>{d.title}</div>
                    <div title={d.body} style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "420px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.body}
                    </div>
                    {d.status === "rejected" && d.reviewNote && (
                      <div style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "4px" }}>Catatan admin: {d.reviewNote}</div>
                    )}
                    {d.mediaUrl && (
                      <div style={{ fontSize: "0.75rem", marginTop: "4px" }}>
                        <a href={d.mediaUrl} target="_blank" rel="noreferrer">🔗 media</a>
                      </div>
                    )}
                  </td>
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

      {selected && <PressDraftDetailModal draft={selected} onClose={() => setSelected(null)} />}

      {modalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div className="glass-panel" style={{ padding: "28px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: "16px" }}>{editing ? "Edit Draf" : "Buat Draf Press Release"}</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "16px" }}>
              Tulis judul + isi siaran pers. Upload gambar/video ke Google Drive lalu paste link-nya di kolom media.
            </p>
            <form onSubmit={handleSave}>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Judul*
                <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Isi press release*
                <textarea className="input-field" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} maxLength={20000} style={{ marginTop: "6px" }} />
              </label>
              <details style={{ marginBottom: "12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "10px", padding: "10px 12px" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 700 }}>
                  Panduan 5W+1H (opsional — bantu admin verifikasi kelengkapan berita)
                </summary>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "6px 0 10px 0" }}>
                  Isi sebisanya. Tidak wajib semua, tapi makin lengkap makin cepat di-approve.
                </p>
                {W5H1_FIELDS.map((f) => (
                  <label key={f.key} style={{ display: "block", marginBottom: "10px", fontSize: "0.85rem" }}>{f.label}
                    <textarea
                      className="input-field"
                      value={(form as Record<string, string>)[f.key] || ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      rows={2}
                      maxLength={2000}
                      style={{ marginTop: "6px" }}
                    />
                  </label>
                ))}
              </details>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Link media gambar/video (opsional)
                <input className="input-field" value={form.mediaUrl} onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })} placeholder="https://…" style={{ marginTop: "6px" }} />
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
