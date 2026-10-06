"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { uploadVisitEvidence, validateStorageFile } from "@/lib/storage";
import {
  KOLEKTIBILITAS_OPTIONS,
  TINDAK_LANJUT_OPTIONS,
  KONDISI_MITRA_OPTIONS,
} from "@/lib/pumkVisit";
import { UNIT_OPTIONS } from "@/lib/roles";

interface Visit {
  id: string;
  unitId: string;
  tanggalKunjungan: string;
  noId: string;
  namaMitra: string;
  kolektibilitas: string;
  saldoPokok: number;
  saldoJasa: number;
  totalSaldo: number;
  jenisTindakLanjut: string;
  lokasiUrl?: string | null;
  kondisiMitra?: string | null;
  formOUrl?: string | null;
  dokumenLainUrl?: string | null;
  buktiBayarUrl?: string | null;
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

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PumkKunjunganPage() {
  const { user, getToken } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [bulan, setBulan] = useState(currentMonth());
  const [fUnit, setFUnit] = useState("");

  // Form (cerminan g-form Laporan Pengelolaan UMK)
  const [tanggal, setTanggal] = useState(today());
  const [noId, setNoId] = useState("");
  const [namaMitra, setNamaMitra] = useState("");
  const [kolektibilitas, setKolektibilitas] = useState("Masalah");
  const [saldoPokok, setSaldoPokok] = useState("");
  const [saldoJasa, setSaldoJasa] = useState("");
  const [totalSaldo, setTotalSaldo] = useState("");
  const [jenis, setJenis] = useState("Inventarisasi");
  const [lokasiUrl, setLokasiUrl] = useState("");
  const [kondisiMitra, setKondisiMitra] = useState("");
  // Dokumen diupload langsung ke Storage internal (bukan tempel link).
  const [formOFile, setFormOFile] = useState<File | null>(null);
  const [dokumenLainFile, setDokumenLainFile] = useState<File | null>(null);
  const [buktiBayarFile, setBuktiBayarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "administrator" || user?.role === "admin_uid" || (user?.role as string) === "admin";
  const isSuperAdmin = user?.role === "administrator" || (user?.role as string) === "admin";
  const isUnitRole = user?.role === "staff" || user?.role === "team_leader" || user?.role === "asman";
  // Admin UID hanya menerima/memonitor laporan — form input khusus role unit.
  const canInput = isUnitRole || isSuperAdmin;

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
      const res = await fetch(`/api/pumk-visits?${q.toString()}`, { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setVisits(data.visits || []);
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

  const resetForm = () => {
    setNoId(""); setNamaMitra(""); setKolektibilitas("Masalah");
    setSaldoPokok(""); setSaldoJasa(""); setTotalSaldo("");
    setJenis("Inventarisasi"); setLokasiUrl(""); setKondisiMitra("");
    setFormOFile(null); setDokumenLainFile(null); setBuktiBayarFile(null);
  };

  const fileLabel = (f: File | null) =>
    f ? `${f.name} (${(f.size / 1024).toFixed(0)} KB)` : "Belum ada file";

  const handleCreate = async () => {
    const pokok = Number(saldoPokok || 0);
    const jasa = Number(saldoJasa || 0);
    const total = totalSaldo === "" ? pokok + jasa : Number(totalSaldo);
    if (!tanggal || !noId.trim() || !namaMitra.trim()) {
      setError("Tanggal kunjungan, Nomor ID, dan Nama Mitra wajib diisi.");
      return;
    }
    if (jenis === "Inventarisasi" && (!lokasiUrl.trim() || !kondisiMitra)) {
      setError("Lokasi Mitra dan Kondisi Mitra wajib untuk Inventarisasi.");
      return;
    }
    // Validasi file sebelum POST agar tidak ada draf yatim tanpa bukti wajib.
    for (const [label, f] of [["Form O", formOFile], ["Dokumen lain", dokumenLainFile], ["Bukti bayar", buktiBayarFile]] as const) {
      if (f) {
        const err = validateStorageFile(f);
        if (err) { setError(`${label}: ${err}`); return; }
      }
    }
    if (jenis === "Penagihan" && !buktiBayarFile) {
      setError("File bukti pembayaran wajib untuk Penagihan.");
      return;
    }
    if (!user) { setError("Belum login."); return; }
    try {
      setSaving(true);
      setMsg("Menyimpan draf...");
      const created = await callApi("/api/pumk-visits", "POST", {
        tanggalKunjungan: tanggal,
        noId, namaMitra, kolektibilitas,
        saldoPokok: pokok, saldoJasa: jasa, totalSaldo: total,
        jenisTindakLanjut: jenis,
        lokasiUrl: lokasiUrl || null,
        kondisiMitra: kondisiMitra || null,
        formOUrl: null,
        dokumenLainUrl: null,
        buktiBayarUrl: null,
      });
      const visitId = String(created.id);
      const urls: Record<string, string> = {};
      const jobs: [string, File | null, "form-o" | "dokumen-lain" | "bukti-bayar", string][] = [
        ["Mengunggah Form O...", formOFile, "form-o", "formOUrl"],
        ["Mengunggah dokumen lain...", dokumenLainFile, "dokumen-lain", "dokumenLainUrl"],
        ["Mengunggah bukti bayar...", buktiBayarFile, "bukti-bayar", "buktiBayarUrl"],
      ];
      for (const [label, f, kind, field] of jobs) {
        if (!f) continue;
        setMsg(label);
        urls[field] = await uploadVisitEvidence(user.uid, visitId, kind, f);
      }
      if (Object.keys(urls).length > 0) {
        await callApi(`/api/pumk-visits/${visitId}`, "PATCH", urls);
      }
      setMsg("Laporan kunjungan tersimpan sebagai draf.");
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (v: Visit, action: string) => {
    let note: string | undefined;
    if (action === "reject") {
      const n = prompt(`Tolak laporan "${v.noId} - ${v.namaMitra}"? Catatan:`);
      if (n === null) return;
      note = n;
    } else if (action === "approve") {
      if (!confirm(`Setujui laporan "${v.noId} - ${v.namaMitra}"?`)) return;
    } else if (action === "delete") {
      if (!confirm(`Hapus laporan "${v.noId} - ${v.namaMitra}"?`)) return;
      try {
        await callApi(`/api/pumk-visits/${v.id}`, "DELETE");
        setMsg("Laporan dihapus.");
        await loadData();
      } catch (err: any) { setError(err.message); }
      return;
    }
    try {
      await callApi(`/api/pumk-visits/${v.id}`, "PATCH", note !== undefined ? { action, note } : { action });
      setMsg(action === "submit" ? "Diajukan untuk review." : action === "approve" ? "Laporan disetujui." : "Laporan ditolak.");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const canReview = (v: Visit) => {
    if (isAdmin) return v.status === "pending";
    if ((user?.role === "team_leader" || user?.role === "asman") && v.unitId === user?.unitId && v.authorUid !== user?.uid) {
      return v.status === "pending";
    }
    return false;
  };

  const rupiah = (n: number) => Number(n || 0).toLocaleString("id-ID");

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Laporan Kunjungan PUMK</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Pengganti g-form Laporan Pengelolaan UMK • unit {isAdmin ? "semua" : <b>{user?.unitId}</b>} • draf → review → rekap.
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

      {canInput && (
        <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
          <h2 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", fontWeight: 700 }}>Tambah Laporan Kunjungan</h2>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Tanggal kunjungan</label>
              <input className="input-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Nomor ID</label>
              <input className="input-field" placeholder="Kunci ke Database PUMK" value={noId} onChange={(e) => setNoId(e.target.value)} style={{ minWidth: "160px" }} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Nama Mitra</label>
              <input className="input-field" placeholder="Nama mitra binaan" value={namaMitra} onChange={(e) => setNamaMitra(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Kolektibilitas</label>
              <select className="input-field" value={kolektibilitas} onChange={(e) => setKolektibilitas(e.target.value)}>
                {KOLEKTIBILITAS_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Saldo Pokok</label>
              <input className="input-field" type="number" min="0" placeholder="cth: 15000000" value={saldoPokok} onChange={(e) => setSaldoPokok(e.target.value)} style={{ width: "150px" }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Saldo Jasa</label>
              <input className="input-field" type="number" min="0" placeholder="cth: 15000000" value={saldoJasa} onChange={(e) => setSaldoJasa(e.target.value)} style={{ width: "150px" }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Total Saldo (kosong = otomatis)</label>
              <input className="input-field" type="number" min="0" placeholder={String(Number(saldoPokok || 0) + Number(saldoJasa || 0))} value={totalSaldo} onChange={(e) => setTotalSaldo(e.target.value)} style={{ width: "150px" }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Jenis Tindak Lanjut</label>
              <select className="input-field" value={jenis} onChange={(e) => setJenis(e.target.value)}>
                {TINDAK_LANJUT_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {jenis === "Inventarisasi" ? (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "12px" }}>
              <div style={{ flex: "1 1 220px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Lokasi Mitra (titik Google Maps)</label>
                <input className="input-field" placeholder="https://maps…" value={lokasiUrl} onChange={(e) => setLokasiUrl(e.target.value.trim())} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Kondisi Mitra</label>
                <select className="input-field" value={kondisiMitra} onChange={(e) => setKondisiMitra(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {KONDISI_MITRA_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>File Form O — PDF/gambar maks 10 MB (opsional)</label>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFormOFile(e.target.files?.[0] || null)} style={{ width: "100%" }} />
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>{fileLabel(formOFile)}</div>
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>File dokumen lain (opsional)</label>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDokumenLainFile(e.target.files?.[0] || null)} style={{ width: "100%" }} />
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>{fileLabel(dokumenLainFile)}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "12px" }}>
              <div style={{ flex: "1 1 220px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>File bukti pembayaran piutang (wajib)</label>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setBuktiBayarFile(e.target.files?.[0] || null)} style={{ width: "100%" }} />
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>{fileLabel(buktiBayarFile)}</div>
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>File Form O — PDF/gambar maks 10 MB (opsional)</label>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFormOFile(e.target.files?.[0] || null)} style={{ width: "100%" }} />
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>{fileLabel(formOFile)}</div>
              </div>
            </div>
          )}

          <div style={{ marginTop: "16px" }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan draf"}
            </button>
          </div>
          <p style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Nomor ID mengacu ke Database PUMK (master read-only). File terupload ke Storage internal proyek (PDF/gambar, maks 10 MB per file).
          </p>
        </section>
      )}

      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, marginRight: "auto" }}>Daftar Laporan</h2>
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
                {["TANGGAL", "NO ID", "MITRA", "KOLEKT.", "TINDAK LANJUT", "TOTAL SALDO", "STATUS", "AKSI"].map((c) => (
                  <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Memuat...</td></tr>
              ) : visits.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Belum ada laporan bulan ini.</td></tr>
              ) : visits.map((v) => (
                <tr key={v.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{v.tanggalKunjungan}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{v.noId}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div>{v.namaMitra}</div>
                    <div style={{ marginTop: "4px", display: "flex", gap: "8px", fontSize: "0.75rem" }}>
                      {v.formOUrl && <a href={v.formOUrl} target="_blank" rel="noopener noreferrer">Form O</a>}
                      {v.buktiBayarUrl && <a href={v.buktiBayarUrl} target="_blank" rel="noopener noreferrer">Bukti bayar</a>}
                      {v.dokumenLainUrl && <a href={v.dokumenLainUrl} target="_blank" rel="noopener noreferrer">Dok. lain</a>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{v.kolektibilitas}</td>
                  <td style={{ padding: "10px 12px" }}>{v.jenisTindakLanjut}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>Rp{rupiah(v.totalSaldo)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, color: "white",
                      background: v.status === "approved" ? "#10b981" : v.status === "pending" ? "#f59e0b" : v.status === "rejected" ? "#ef4444" : "#6b7280" }}>
                      {STATUS_LABEL[v.status] || v.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <select
                      className="input-field"
                      defaultValue=""
                      onChange={(ev) => { const val = ev.target.value; ev.target.value = ""; if (val) handleAction(v, val); }}
                      style={{ padding: "6px 10px", fontSize: "0.8rem", minWidth: "130px" }}
                    >
                      <option value="">— Aksi —</option>
                      {v.authorUid === user?.uid && v.status === "draft" && <option value="submit">Ajukan review</option>}
                      {canReview(v) && <option value="approve">Setujui</option>}
                      {canReview(v) && <option value="reject">Tolak</option>}
                      {((v.authorUid === user?.uid && (v.status === "draft" || v.status === "rejected")) || isAdmin) && (
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
