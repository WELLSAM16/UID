"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { MEDMAS_TIERS } from "@/lib/medmas";
import { UNIT_OPTIONS } from "@/lib/roles";

interface Entry {
  id: string;
  unitId: string;
  tanggal: string;
  outlet: string;
  judul: string;
  url?: string | null;
  tierMedia?: string | null;
  skor: number;
  status: string;
  authorUid: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  pending: "Menunggu review",
  approved: "Disetujui",
  rejected: "Ditolak",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MedmasPage() {
  const { user, getToken } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [bulan, setBulan] = useState(currentMonth());
  const [fUnit, setFUnit] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [outlet, setOutlet] = useState("");
  const [judul, setJudul] = useState("");
  const [url, setUrl] = useState("");
  const [tierMedia, setTierMedia] = useState("");
  const [skor, setSkor] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "administrator" || user?.role === "admin_uid" || (user?.role as string) === "admin";

  async function authHeaders(): Promise<HeadersInit> {
    const token = await getToken();
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const q = new URLSearchParams({ bulan });
      if (isAdmin && fUnit) q.set("unitId", fUnit);
      const res = await fetch(`/api/medmas?${q.toString()}`, { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setEntries(data.entries || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bulan, fUnit]);

  async function callApi(url: string, method: string, body?: unknown) {
    setMsg(null);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `API ${res.status}`);
    return data;
  }

  const handleCreate = async () => {
    if (!tanggal || !outlet.trim() || !judul.trim() || skor === "") {
      setError("Tanggal, outlet, judul, dan skor wajib diisi.");
      return;
    }
    try {
      setSaving(true);
      await callApi("/api/medmas", "POST", {
        tanggal, outlet, judul, url: url || null,
        tierMedia: tierMedia || null, skor: Number(skor),
      });
      setMsg("Entri medmas tersimpan sebagai draf.");
      setTanggal(""); setOutlet(""); setJudul(""); setUrl(""); setTierMedia(""); setSkor("");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (e: Entry, action: string) => {
    let note: string | undefined;
    if (action === "reject") {
      const n = prompt(`Tolak "${e.judul}"? Catatan:`);
      if (n === null) return;
      note = n;
    } else if (action === "approve") {
      if (!confirm(`Setujui "${e.judul}" (skor ${e.skor})?`)) return;
    } else if (action === "delete") {
      if (!confirm(`Hapus entri "${e.judul}"?`)) return;
      try {
        await callApi(`/api/medmas/${e.id}`, "DELETE");
        setMsg("Entri dihapus.");
        await loadData();
      } catch (err: any) { setError(err.message); }
      return;
    }
    try {
      await callApi(`/api/medmas/${e.id}`, "PATCH", note !== undefined ? { action, note } : { action });
      setMsg(action === "submit" ? "Diajukan untuk review." : action === "approve" ? "Entri disetujui." : "Entri ditolak.");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const canReview = (e: Entry) => {
    if (isAdmin) return e.status === "pending";
    if ((user?.role === "team_leader" || user?.role === "asman") && e.unitId === user?.unitId && e.authorUid !== user?.uid) {
      return e.status === "pending";
    }
    return false;
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Input Medmas</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Pemberitaan media massa unit {isAdmin ? "semua" : <b>{user?.unitId}</b>} • draf → review TL/Asman → rekap.
        </p>
      </header>

      {msg && (
        <div style={{ marginBottom: "16px", padding: "10px 18px", borderRadius: "10px", fontSize: "0.875rem", background: "rgba(16, 185, 129, 0.12)", color: "var(--success)", border: "1px solid var(--card-border)" }}>
          {msg}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: "16px", padding: "10px 18px", borderRadius: "10px", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid var(--card-border)" }}>
          {error}
        </div>
      )}

      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", fontWeight: 700 }}>Tambah Pemberitaan</h2>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Tanggal terbit</label>
            <input className="input-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Outlet / Media</label>
            <input className="input-field" placeholder="cth: Kompas" value={outlet} onChange={(e) => setOutlet(e.target.value)} style={{ minWidth: "160px" }} />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Judul</label>
            <input className="input-field" placeholder="Judul pemberitaan" value={judul} onChange={(e) => setJudul(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Tier media</label>
            <select className="input-field" value={tierMedia} onChange={(e) => setTierMedia(e.target.value)}>
              <option value="">—</option>
              {MEDMAS_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Skor</label>
            <input className="input-field" type="number" min="0" placeholder="cth: 100" value={skor} onChange={(e) => setSkor(e.target.value)} style={{ width: "110px" }} />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Link berita (opsional)</label>
            <input className="input-field" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value.trim())} style={{ width: "100%" }} />
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan draf"}
          </button>
        </div>
        <p style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Skor mengikuti file skoring bulanan. Kalibrasi tier/bobot otomatis menyusul.
        </p>
      </section>

      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, marginRight: "auto" }}>Daftar Entri</h2>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.8rem", fontWeight: 600 }}>Bulan</label>
            <input className="input-field" type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} />
          </div>
          {isAdmin && (
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.8rem", fontWeight: 600 }}>Unit</label>
              <select className="input-field" value={fUnit} onChange={(e) => setFUnit(e.target.value)}>
                <option value="">Semua unit</option>
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <button className="btn" onClick={loadData} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
            Muat ulang
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["TANGGAL", "OUTLET", "JUDUL", "TIER", "SKOR", "STATUS", "AKSI"].map((c) => (
                  <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Memuat...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Belum ada entri bulan ini.</td></tr>
              ) : entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{e.tanggal}</td>
                  <td style={{ padding: "10px 12px" }}>{e.outlet}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.judul}</a> : e.judul}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{e.tierMedia || "-"}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{e.skor}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, color: "white",
                      background: e.status === "approved" ? "#10b981" : e.status === "pending" ? "#f59e0b" : e.status === "rejected" ? "#ef4444" : "#6b7280" }}>
                      {STATUS_LABEL[e.status] || e.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <select
                      className="input-field"
                      defaultValue=""
                      onChange={(ev) => { const v = ev.target.value; ev.target.value = ""; if (v) handleAction(e, v); }}
                      style={{ padding: "6px 10px", fontSize: "0.8rem", minWidth: "130px" }}
                    >
                      <option value="">— Aksi —</option>
                      {e.authorUid === user?.uid && e.status === "draft" && <option value="submit">Ajukan review</option>}
                      {canReview(e) && <option value="approve">Setujui</option>}
                      {canReview(e) && <option value="reject">Tolak</option>}
                      {((e.authorUid === user?.uid && (e.status === "draft" || e.status === "rejected")) || isAdmin) && (
                        <option value="delete">Hapus</option>
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
