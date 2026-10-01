"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";

interface PressSource {
  id: string;
  label: string;
  sheetId: string;
  gid: string;
  targetPerUnit: number;
  validYear: number;
  isActive: boolean;
  updatedAt?: string;
}

const EMPTY = {
  label: "",
  spreadsheetUrl: "",
  gid: "",
  targetPerUnit: "12",
  validYear: "2026",
};

export default function PressSourcesAdminPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [sources, setSources] = useState<PressSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PressSource | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [makeActive, setMakeActive] = useState(true);
  const [saving, setSaving] = useState(false);

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
      const res = await authFetch("/api/press-release-sources");
      const data = await parseJson(res);
      setSources(data.sources || []);
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
    setMakeActive(sources.length === 0 ? true : false);
    setModalOpen(true);
  };

  const openEdit = (s: PressSource) => {
    setEditing(s);
    setForm({
      label: s.label,
      spreadsheetUrl: "",
      gid: s.gid,
      targetPerUnit: String(s.targetPerUnit),
      validYear: String(s.validYear),
    });
    setMakeActive(s.isActive);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) {
      alert("Label wajib diisi (mis. 2027 Semester 1)");
      return;
    }
    const targetPerUnit = parseInt(form.targetPerUnit, 10);
    const validYear = parseInt(form.validYear, 10);
    if (!Number.isInteger(targetPerUnit) || targetPerUnit < 1 || targetPerUnit > 1000) {
      alert("Target per unit harus bilangan bulat 1-1000");
      return;
    }
    if (!Number.isInteger(validYear) || validYear < 2000 || validYear > 2100) {
      alert("Tahun valid harus 2000-2100");
      return;
    }
    if (!editing && !form.spreadsheetUrl.trim()) {
      alert("Paste link spreadsheet (atau ID) — wajib untuk sumber baru");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        label: form.label.trim(),
        targetPerUnit,
        validYear,
        isActive: makeActive,
      };
      if (form.spreadsheetUrl.trim()) payload.spreadsheetUrl = form.spreadsheetUrl.trim();
      if (form.gid.trim()) payload.gid = form.gid.trim();
      let res: Response;
      if (editing) {
        res = await authFetch(`/api/press-release-sources/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch("/api/press-release-sources", {
          method: "POST",
          body: JSON.stringify(payload),
        });
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

  const setActive = async (s: PressSource) => {
    if (s.isActive) return;
    if (!confirm(`Jadikan "${s.label}" sebagai sumber aktif?`)) return;
    try {
      const res = await authFetch(`/api/press-release-sources/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "setActive" }),
      });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal: " + e.message);
    }
  };

  const remove = async (s: PressSource) => {
    if (!confirm(`Hapus sumber "${s.label}" permanen?`)) return;
    try {
      const res = await authFetch(`/api/press-release-sources/${s.id}`, { method: "DELETE" });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal hapus: " + e.message);
    }
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Kelola Sumber Press Release</h1>
        </div>
        <button className="btn" onClick={openCreate} style={{ background: "#38bdf8", color: "white" }}>+ Tambah Sumber</button>
      </header>

      {loading && <div className="glass-panel" style={{ padding: "24px" }}>Memuat sumber…</div>}
      {error && <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)" }}>{error}</div>}

      {!loading && !error && (
        <div className="glass-panel" style={{ padding: "24px" }}>
          {sources.length === 0 && (
            <p style={{ fontSize: "0.9rem" }}>
              Belum ada sumber terdaftar — monitoring memakai sheet default 2026 Semester 2.
              Tambahkan sumber pertama untuk mulai mengelola per tahun.
            </p>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Sheet / GID</th>
                <th>Target</th>
                <th>Tahun</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} style={s.isActive ? { background: "rgba(16,185,129,0.05)" } : {}}>
                  <td style={{ fontWeight: 600 }}>{s.label}</td>
                  <td style={{ fontSize: "0.78rem", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span title={s.sheetId}>{s.sheetId.slice(0, 18)}…</span>
                    <span style={{ color: "var(--text-muted)" }}> gid:{s.gid}</span>
                  </td>
                  <td>{s.targetPerUnit}</td>
                  <td>{s.validYear}</td>
                  <td>
                    {s.isActive ? (
                      <span style={{ padding: "4px 10px", background: "rgba(16,185,129,0.15)", color: "#10b981", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700 }}>
                        Aktif
                      </span>
                    ) : (
                      <span style={{ padding: "4px 10px", background: "rgba(148,163,184,0.15)", color: "#94a3b8", borderRadius: "999px", fontSize: "0.75rem" }}>
                        Arsip
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {!s.isActive && (
                        <button className="btn btn-primary" style={{ padding: "5px 10px" }} onClick={() => setActive(s)}>Aktifkan</button>
                      )}
                      <button className="btn" style={{ padding: "5px 10px", background: "rgba(255,255,255,0.1)" }} onClick={() => openEdit(s)}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: "5px 10px" }} onClick={() => remove(s)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div className="glass-panel" style={{ padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: "16px" }}>{editing ? "Edit Sumber" : "Tambah Sumber Spreadsheet"}</h2>
            <form onSubmit={handleSave}>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Label* (mis. 2027 Semester 1)
                <input className="input-field" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={80} style={{ marginTop: "6px" }} />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>
                {editing ? "Link spreadsheet baru (kosongkan bila tidak ganti sheet)" : "Link / ID spreadsheet*"}
                <input
                  className="input-field"
                  value={form.spreadsheetUrl}
                  onChange={(e) => setForm({ ...form, spreadsheetUrl: e.target.value })}
                  placeholder="https://docs.google.com/spreadsheets/d/…#gid=…"
                  style={{ marginTop: "6px" }}
                />
              </label>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>GID tab (opsional — diambil dari link bila kosong)
                <input className="input-field" value={form.gid} onChange={(e) => setForm({ ...form, gid: e.target.value })} placeholder="0" style={{ marginTop: "6px" }} />
              </label>
              <div style={{ display: "flex", gap: "12px" }}>
                <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem", flex: 1 }}>Target/unit*
                  <input type="number" min={1} max={1000} className="input-field" value={form.targetPerUnit} onChange={(e) => setForm({ ...form, targetPerUnit: e.target.value })} style={{ marginTop: "6px" }} />
                </label>
                <label style={{ display: "block", marginBottom: "12px", fontSize: "0.9rem", flex: 1 }}>Tahun valid*
                  <input type="number" min={2000} max={2100} className="input-field" value={form.validYear} onChange={(e) => setForm({ ...form, validYear: e.target.value })} style={{ marginTop: "6px" }} />
                </label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", marginBottom: "20px" }}>
                <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} />
                Jadikan sumber aktif (menonaktifkan yang lain)
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
