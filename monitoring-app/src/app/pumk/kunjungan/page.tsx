"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import {
  KOLEKTIBILITAS_OPTIONS,
  TINDAK_LANJUT_OPTIONS,
  KONDISI_MITRA_OPTIONS,
} from "@/lib/pumkVisit";
import { UNIT_OPTIONS } from "@/lib/roles";
import { validateMediaFile } from "@/lib/mediaShared";
import { openMediaFile, uploadMediaFile } from "@/lib/mediaClient";

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
  formOPath?: string | null;
  formOName?: string | null;
  dokumenLainPath?: string | null;
  dokumenLainName?: string | null;
  evidencePath?: string | null;
  evidenceName?: string | null;
  buktiBayarPath?: string | null;
  buktiBayarName?: string | null;
  status: string;
  authorUid: string;
  reviewNote?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  pending: "Menunggu Asman",
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

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontSize: "0.85rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--text-muted)",
  marginTop: "4px",
};

/** Foto evidence: hanya gambar (bukan PDF). */
const EVIDENCE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const EVIDENCE_LIMITS = { allowedMime: EVIDENCE_MIME };

/**
 * Satu field dalam grid 12 kolom.
 *
 * WAJIB di level modul: kalau didefinisikan di dalam komponen, tipe komponennya
 * berubah setiap render sehingga React meng-unmount input dan fokus hilang
 * setelah satu karakter.
 */
function Field({
  label,
  hint,
  span,
  children,
}: {
  label: string;
  hint?: string;
  span: 3 | 4 | 6 | 8 | 12;
  children: React.ReactNode;
}) {
  return (
    <div className={`kspan-${span}`}>
      <label style={labelStyle} title={label}>{label}</label>
      {children}
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  );
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
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // Lampirkan file ke draf yang sudah ada (mis. draf dibuat tanpa file).
  const [attachFor, setAttachFor] = useState<Visit | null>(null);
  const [atFormO, setAtFormO] = useState<File | null>(null);
  const [atDokLain, setAtDokLain] = useState<File | null>(null);
  const [atBukti, setAtBukti] = useState<File | null>(null);
  const [atEvidence, setAtEvidence] = useState<File | null>(null);
  const [attaching, setAttaching] = useState(false);

  // Edit laporan (TL se-unit / admin) — data teks, file tetap lewat "Lampirkan file".
  const [editFor, setEditFor] = useState<Visit | null>(null);
  const [eTanggal, setETanggal] = useState("");
  const [eNoId, setENoId] = useState("");
  const [eNamaMitra, setENamaMitra] = useState("");
  const [eKolektibilitas, setEKolektibilitas] = useState("Masalah");
  const [eSaldoPokok, setESaldoPokok] = useState("");
  const [eSaldoJasa, setESaldoJasa] = useState("");
  const [eTotalSaldo, setETotalSaldo] = useState("");
  const [eJenis, setEJenis] = useState("Inventarisasi");
  const [eLokasiUrl, setELokasiUrl] = useState("");
  const [eKondisiMitra, setEKondisiMitra] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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
    setFormOFile(null); setDokumenLainFile(null); setBuktiBayarFile(null); setEvidenceFile(null);
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
    if (jenis === "Penagihan" && !buktiBayarFile) {
      setError("File bukti pembayaran wajib untuk Penagihan.");
      return;
    }

    // Kumpulkan file yang dipilih -> dipetakan ke field dokumen.
    const files: { field: string; nameField: string; file: File; label: string; limits?: { allowedMime: readonly string[] } }[] = [];
    if (evidenceFile) files.push({ field: "evidencePath", nameField: "evidenceName", file: evidenceFile, label: "Foto bukti kunjungan", limits: EVIDENCE_LIMITS });
    if (formOFile) files.push({ field: "formOPath", nameField: "formOName", file: formOFile, label: "Form O" });
    if (dokumenLainFile) files.push({ field: "dokumenLainPath", nameField: "dokumenLainName", file: dokumenLainFile, label: "Dokumen lain" });
    if (buktiBayarFile) files.push({ field: "buktiBayarPath", nameField: "buktiBayarName", file: buktiBayarFile, label: "Bukti pembayaran" });
    for (const f of files) {
      const ferr = validateMediaFile(f.file, f.limits);
      if (ferr) {
        setError(`${f.label}: ${ferr}`);
        return;
      }
    }

    setSaving(true);
    setProgress(null);
    setMsg(null);
    let createdId: string | null = null;
    try {
      // 1. Buat draf dulu supaya punya id (dipakai di path file).
      const created = await callApi("/api/pumk-visits", "POST", {
        tanggalKunjungan: tanggal,
        noId, namaMitra, kolektibilitas,
        saldoPokok: pokok, saldoJasa: jasa, totalSaldo: total,
        jenisTindakLanjut: jenis,
        lokasiUrl: lokasiUrl || null,
        kondisiMitra: kondisiMitra || null,
      });
      createdId = String(created.id);

      // 2. Upload file langsung ke PC (tidak lewat Vercel).
      if (files.length) {
        const token = await getToken();
        if (!token) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
        const patch: Record<string, unknown> = { action: "update" };
        for (const f of files) {
          setProgress(`${f.label}: menyiapkan...`);
          const res = await uploadMediaFile({
            token,
            target: { collection: "pumk_visits", id: createdId, field: f.field },
            file: f.file,
            onProgress: (p) => setProgress(`${f.label}: ${p}%`),
          });
          patch[f.field] = res.path;
          patch[f.nameField] = f.file.name.slice(0, 120);
          setProgress(`${f.label}: selesai`);
        }
        // 3. Simpan path ke dokumen.
        await callApi(`/api/pumk-visits/${createdId}`, "PATCH", patch);
      }

      setMsg(
        files.length
          ? "Laporan dan file bukti tersimpan sebagai draf."
          : "Laporan kunjungan tersimpan sebagai draf."
      );
      resetForm();
      await loadData();
    } catch (err: any) {
      // Jangan tinggalkan draf setengah jadi: batalkan kalau baru dibuat.
      if (createdId) {
        try {
          await callApi(`/api/pumk-visits/${createdId}`, "DELETE");
        } catch {
          /* draf mungkin sudah submitted; abaikan */
        }
      }
      setError(err.message + (createdId ? " (draf dibatalkan)" : ""));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  /** Buka file bukti lewat URL bertoken 15 menit. */
  const openFile = async (v: Visit, field: string) => {
    try {
      setError(null);
      await openMediaFile({ token: getToken, target: { collection: "pumk_visits", id: v.id, field } });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAction = async (v: Visit, action: string) => {
    if (action === "attach") {
      setAtFormO(null); setAtDokLain(null); setAtBukti(null); setAtEvidence(null);
      setAttachFor(v);
      return;
    }
    if (action === "edit") {
      openEdit(v);
      return;
    }
    if (action === "submit" && !v.evidencePath) {
      setError("Unggah foto bukti kunjungan dulu lewat menu \"Lampirkan file\" sebelum mengajukan.");
      return;
    }
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
      setMsg(action === "submit" ? "Diajukan ke Asman untuk review." : action === "approve" ? "Laporan disetujui." : "Laporan ditolak.");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  /** Unggah file tambahan ke draf yang sudah ada (hanya selama status draf). */
  const handleAttach = async () => {
    const v = attachFor;
    if (!v) return;
    const jobs: { field: string; nameField: string; file: File; label: string; limits?: { allowedMime: readonly string[] } }[] = [];
    if (atEvidence) jobs.push({ field: "evidencePath", nameField: "evidenceName", file: atEvidence, label: "Foto bukti kunjungan", limits: EVIDENCE_LIMITS });
    if (atFormO) jobs.push({ field: "formOPath", nameField: "formOName", file: atFormO, label: "Form O" });
    if (atDokLain) jobs.push({ field: "dokumenLainPath", nameField: "dokumenLainName", file: atDokLain, label: "Dokumen lain" });
    if (atBukti) jobs.push({ field: "buktiBayarPath", nameField: "buktiBayarName", file: atBukti, label: "Bukti pembayaran" });
    if (!jobs.length) {
      setError("Pilih minimal satu file.");
      return;
    }
    for (const j of jobs) {
      const ferr = validateMediaFile(j.file, j.limits);
      if (ferr) {
        setError(`${j.label}: ${ferr}`);
        return;
      }
    }

    setAttaching(true);
    setProgress(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
      const patch: Record<string, unknown> = { action: "update" };
      for (const j of jobs) {
        setProgress(`${j.label}: menyiapkan...`);
        const res = await uploadMediaFile({
          token,
          target: { collection: "pumk_visits", id: v.id, field: j.field },
          file: j.file,
          onProgress: (p) => setProgress(`${j.label}: ${p}%`),
        });
        patch[j.field] = res.path;
        patch[j.nameField] = j.file.name.slice(0, 120);
        setProgress(`${j.label}: selesai`);
      }
      await callApi(`/api/pumk-visits/${v.id}`, "PATCH", patch);
      setMsg("File bukti tersimpan.");
      setAttachFor(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAttaching(false);
      setProgress(null);
    }
  };

  const isTlUnit = (v: Visit) =>
    user?.role === "team_leader" && !!v.unitId && v.unitId === user?.unitId;
  const isAsmanUnit = (v: Visit) =>
    user?.role === "asman" && !!v.unitId && v.unitId === user?.unitId;

  /** Setujui/tolak hanya Asman se-unit (bukan penulis sendiri); admin tidak menyetujui. */
  const canReview = (v: Visit) => {
    if (isAsmanUnit(v) && v.authorUid !== user?.uid) return v.status === "pending";
    return false;
  };

  /** TL se-unit boleh mengedit laporan unitnya; penulis boleh mengedit draf/ditolaknya. */
  const canEdit = (v: Visit) => {
    if (isAdmin) return true;
    if (v.status !== "draft" && v.status !== "rejected") return false;
    if (v.authorUid === user?.uid) return true;
    return isTlUnit(v);
  };

  /** Pengajuan ke Asman oleh penulis atau TL se-unit. */
  const canSubmit = (v: Visit) =>
    (v.status === "draft" || v.status === "rejected") &&
    (v.authorUid === user?.uid || isTlUnit(v));

  const canAttachFile = (v: Visit) =>
    (v.status === "draft" || v.status === "rejected") &&
    (v.authorUid === user?.uid || isTlUnit(v) || isAdmin);

  const openEdit = (v: Visit) => {
    setEditFor(v);
    setETanggal(v.tanggalKunjungan || "");
    setENoId(v.noId || "");
    setENamaMitra(v.namaMitra || "");
    setEKolektibilitas(v.kolektibilitas || "Masalah");
    setESaldoPokok(String(v.saldoPokok ?? 0));
    setESaldoJasa(String(v.saldoJasa ?? 0));
    setETotalSaldo(String(v.totalSaldo ?? 0));
    setEJenis(v.jenisTindakLanjut || "Inventarisasi");
    setELokasiUrl(v.lokasiUrl || "");
    setEKondisiMitra(v.kondisiMitra || "");
    setMsg(null);
    setError(null);
  };

  const handleEditSave = async () => {
    const v = editFor;
    if (!v) return;
    const pokok = Number(eSaldoPokok || 0);
    const jasa = Number(eSaldoJasa || 0);
    const total = eTotalSaldo === "" ? pokok + jasa : Number(eTotalSaldo);
    if (!eTanggal || !eNoId.trim() || !eNamaMitra.trim()) {
      setError("Tanggal kunjungan, Nomor ID, dan Nama Mitra wajib diisi.");
      return;
    }
    if (eJenis === "Inventarisasi" && (!eLokasiUrl.trim() || !eKondisiMitra)) {
      setError("Lokasi Mitra dan Kondisi Mitra wajib untuk Inventarisasi.");
      return;
    }
    setSavingEdit(true);
    setMsg(null);
    setError(null);
    try {
      await callApi(`/api/pumk-visits/${v.id}`, "PATCH", {
        tanggalKunjungan: eTanggal,
        noId: eNoId,
        namaMitra: eNamaMitra,
        kolektibilitas: eKolektibilitas,
        saldoPokok: pokok,
        saldoJasa: jasa,
        totalSaldo: total,
        jenisTindakLanjut: eJenis,
        lokasiUrl: eLokasiUrl || null,
        kondisiMitra: eKondisiMitra || null,
      });
      setMsg("Laporan diperbarui.");
      setEditFor(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const rupiah = (n: number) => Number(n || 0).toLocaleString("id-ID");

  const fileBtn: React.CSSProperties = {
    background: "none",
    border: 0,
    padding: 0,
    cursor: "pointer",
    color: "var(--primary)",
    textDecoration: "underline",
    font: "inherit",
    fontSize: "0.75rem",
    fontWeight: 600,
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Laporan Kunjungan PUMK</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Pengganti g-form Laporan Pengelolaan UMK • unit {isAdmin ? "semua" : <b>{user?.unitId}</b>} • draf → Asman → UID.
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
          <div className="kunj-grid">
            <Field label="Tanggal kunjungan" span={3}>
              <input className="input-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </Field>
            <Field label="Nomor ID" span={3} hint="Kunci ke Database PUMK">
              <input className="input-field" placeholder="cth: 01-01-396/96" value={noId} onChange={(e) => setNoId(e.target.value)} />
            </Field>
            <Field label="Nama Mitra" span={6}>
              <input className="input-field" placeholder="Nama mitra binaan" value={namaMitra} onChange={(e) => setNamaMitra(e.target.value)} />
            </Field>
            <Field label="Kolektibilitas" span={3}>
              <select className="input-field" value={kolektibilitas} onChange={(e) => setKolektibilitas(e.target.value)}>
                {KOLEKTIBILITAS_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Saldo Pokok" span={3}>
              <input className="input-field" type="number" min="0" placeholder="cth: 15000000" value={saldoPokok} onChange={(e) => setSaldoPokok(e.target.value)} />
            </Field>
            <Field label="Saldo Jasa" span={3}>
              <input className="input-field" type="number" min="0" placeholder="cth: 15000000" value={saldoJasa} onChange={(e) => setSaldoJasa(e.target.value)} />
            </Field>
            <Field label="Total Saldo" span={3} hint="Kosong = pokok + jasa otomatis">
              <input className="input-field" type="number" min="0" placeholder={String(Number(saldoPokok || 0) + Number(saldoJasa || 0))} value={totalSaldo} onChange={(e) => setTotalSaldo(e.target.value)} />
            </Field>
            <Field label="Jenis Tindak Lanjut" span={4}>
              <select className="input-field" value={jenis} onChange={(e) => setJenis(e.target.value)}>
                {TINDAK_LANJUT_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          <h3 style={{ margin: "20px 0 12px 0", fontSize: "0.95rem", fontWeight: 700 }}>
            {jenis === "Inventarisasi" ? "Hasil Inventarisasi" : "Hasil Penagihan"}
          </h3>
          {jenis === "Inventarisasi" ? (
            <div className="kunj-grid">
              <Field label="Lokasi Mitra" span={6} hint="Titik Google Maps">
                <input className="input-field" placeholder="https://maps…" value={lokasiUrl} onChange={(e) => setLokasiUrl(e.target.value.trim())} />
              </Field>
              <Field label="Kondisi Mitra" span={6}>
                <select className="input-field" value={kondisiMitra} onChange={(e) => setKondisiMitra(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {KONDISI_MITRA_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
              <Field label="File Form O (opsional)" span={6} hint={fileLabel(formOFile)}>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFormOFile(e.target.files?.[0] || null)} />
              </Field>
              <Field label="File dokumen lain (opsional)" span={6} hint={fileLabel(dokumenLainFile)}>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDokumenLainFile(e.target.files?.[0] || null)} />
              </Field>
            </div>
          ) : (
            <div className="kunj-grid">
              <Field label="File bukti pembayaran (wajib)" span={6} hint={fileLabel(buktiBayarFile)}>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setBuktiBayarFile(e.target.files?.[0] || null)} />
              </Field>
              <Field label="File Form O (opsional)" span={6} hint={fileLabel(formOFile)}>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFormOFile(e.target.files?.[0] || null)} />
              </Field>
            </div>
          )}

          <div className="kunj-grid" style={{ marginTop: "12px" }}>
            <Field label="Foto bukti kunjungan (wajib saat diajukan)" span={6} hint={evidenceFile ? fileLabel(evidenceFile) : "Ambil foto saat berada di lokasi mitra (JPG/PNG/WebP)"}>
              <input className="input-field" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
            </Field>
          </div>

          <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan draf"}
            </button>
            {progress && (
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{progress}</span>
            )}
          </div>
          <p style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Nomor ID mengacu ke Database PUMK (master read-only). File diunggah ke penyimpanan internal
            (PDF/JPG/PNG/WebP, maks 10 MB); gambar diperkecil otomatis sebelum dikirim.
            Foto bukti kunjungan hanya menerima gambar dan wajib ada sebelum laporan diajukan ke Asman.
          </p>
        </section>
      )}

      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
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
                    <div style={{ marginTop: "4px", display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "0.75rem" }}>
                      {v.evidencePath && (
                        <button type="button" onClick={() => openFile(v, "evidencePath")} title={v.evidenceName || "Foto bukti kunjungan"} style={fileBtn}>
                          Foto kunjungan
                        </button>
                      )}
                      {v.formOPath && (
                        <button type="button" onClick={() => openFile(v, "formOPath")} title={v.formOName || "Form O"} style={fileBtn}>
                          Form O
                        </button>
                      )}
                      {v.buktiBayarPath && (
                        <button type="button" onClick={() => openFile(v, "buktiBayarPath")} title={v.buktiBayarName || "Bukti pembayaran"} style={fileBtn}>
                          Bukti bayar
                        </button>
                      )}
                      {v.dokumenLainPath && (
                        <button type="button" onClick={() => openFile(v, "dokumenLainPath")} title={v.dokumenLainName || "Dokumen lain"} style={fileBtn}>
                          Dok. lain
                        </button>
                      )}
                      {v.formOUrl && <a href={v.formOUrl} target="_blank" rel="noopener noreferrer">Form O (lama)</a>}
                      {v.buktiBayarUrl && <a href={v.buktiBayarUrl} target="_blank" rel="noopener noreferrer">Bukti bayar (lama)</a>}
                      {v.dokumenLainUrl && <a href={v.dokumenLainUrl} target="_blank" rel="noopener noreferrer">Dok. lain (lama)</a>}
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
                      {canEdit(v) && <option value="edit">Edit</option>}
                      {canSubmit(v) && <option value="submit">Ajukan ke Asman</option>}
                      {canAttachFile(v) && <option value="attach">Lampirkan file</option>}
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

      {editFor && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => { if (!savingEdit) setEditFor(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Edit Laporan</h3>
            <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              {editFor.noId} — {editFor.namaMitra}. Perubahan hanya bisa saat status draf atau ditolak.
            </p>
            {editFor.status === "rejected" && editFor.reviewNote && (
              <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid var(--card-border)", fontSize: "0.82rem" }}>
                <b>Catatan Asman:</b> {editFor.reviewNote}
              </div>
            )}

            <div className="kunj-grid" style={{ marginTop: "18px" }}>
              <Field label="Tanggal kunjungan" span={4}>
                <input className="input-field" type="date" value={eTanggal} onChange={(e) => setETanggal(e.target.value)} />
              </Field>
              <Field label="Nomor ID" span={4}>
                <input className="input-field" value={eNoId} onChange={(e) => setENoId(e.target.value)} />
              </Field>
              <Field label="Nama Mitra" span={4}>
                <input className="input-field" value={eNamaMitra} onChange={(e) => setENamaMitra(e.target.value)} />
              </Field>
              <Field label="Kolektibilitas" span={4}>
                <select className="input-field" value={eKolektibilitas} onChange={(e) => setEKolektibilitas(e.target.value)}>
                  {KOLEKTIBILITAS_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
              <Field label="Saldo Pokok" span={4}>
                <input className="input-field" type="number" min="0" value={eSaldoPokok} onChange={(e) => setESaldoPokok(e.target.value)} />
              </Field>
              <Field label="Saldo Jasa" span={4}>
                <input className="input-field" type="number" min="0" value={eSaldoJasa} onChange={(e) => setESaldoJasa(e.target.value)} />
              </Field>
              <Field label="Total Saldo" span={4} hint="Kosong = pokok + jasa">
                <input className="input-field" type="number" min="0" value={eTotalSaldo} onChange={(e) => setETotalSaldo(e.target.value)} />
              </Field>
              <Field label="Jenis Tindak Lanjut" span={4}>
                <select className="input-field" value={eJenis} onChange={(e) => setEJenis(e.target.value)}>
                  {TINDAK_LANJUT_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              {eJenis === "Inventarisasi" && (
                <>
                  <Field label="Lokasi Mitra" span={6}>
                    <input className="input-field" placeholder="https://maps…" value={eLokasiUrl} onChange={(e) => setELokasiUrl(e.target.value.trim())} />
                  </Field>
                  <Field label="Kondisi Mitra" span={6}>
                    <select className="input-field" value={eKondisiMitra} onChange={(e) => setEKondisiMitra(e.target.value)}>
                      <option value="">— Pilih —</option>
                      {KONDISI_MITRA_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </Field>
                </>
              )}
            </div>

            <div style={{ marginTop: "18px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEditFor(null)} disabled={savingEdit}>Batal</button>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={savingEdit}>
                {savingEdit ? "Menyimpan..." : "Simpan perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {attachFor && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => { if (!attaching) setAttachFor(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "540px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
              Lampirkan file
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              {attachFor.noId} — {attachFor.namaMitra}. Hanya bisa saat status draf atau ditolak. File baru
              menggantikan file lama pada field yang sama.
            </p>

            <div style={{ display: "grid", gap: "14px", marginTop: "18px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Foto bukti kunjungan</label>
                <input className="input-field" type="file" accept="image/jpeg,image/png,image/webp" disabled={attaching} onChange={(e) => setAtEvidence(e.target.files?.[0] || null)} />
                <div style={hintStyle}>
                  {atEvidence ? atEvidence.name : attachFor.evidenceName ? `Tersimpan: ${attachFor.evidenceName}` : "Belum ada foto (wajib sebelum diajukan)"}
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Form O</label>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" disabled={attaching} onChange={(e) => setAtFormO(e.target.files?.[0] || null)} />
                <div style={hintStyle}>
                  {atFormO ? atFormO.name : attachFor.formOName ? `Tersimpan: ${attachFor.formOName}` : "Belum ada file"}
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Dokumen lain</label>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" disabled={attaching} onChange={(e) => setAtDokLain(e.target.files?.[0] || null)} />
                <div style={hintStyle}>
                  {atDokLain ? atDokLain.name : attachFor.dokumenLainName ? `Tersimpan: ${attachFor.dokumenLainName}` : "Belum ada file"}
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Bukti pembayaran</label>
                <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" disabled={attaching} onChange={(e) => setAtBukti(e.target.files?.[0] || null)} />
                <div style={hintStyle}>
                  {atBukti ? atBukti.name : attachFor.buktiBayarName ? `Tersimpan: ${attachFor.buktiBayarName}` : "Belum ada file"}
                </div>
              </div>
            </div>

            {progress && (
              <div style={{ marginTop: "12px", fontSize: "0.82rem", color: "var(--text-muted)" }}>{progress}</div>
            )}

            <div style={{ marginTop: "18px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setAttachFor(null)} disabled={attaching}>Batal</button>
              <button className="btn btn-primary" onClick={handleAttach} disabled={attaching}>
                {attaching ? "Mengunggah..." : "Unggah"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .kunj-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 12px 14px;
        }
        .kunj-grid .kspan-3 { grid-column: span 3; }
        .kunj-grid .kspan-4 { grid-column: span 4; }
        .kunj-grid .kspan-6 { grid-column: span 6; }
        .kunj-grid .kspan-8 { grid-column: span 8; }
        .kunj-grid .kspan-12 { grid-column: span 12; }
        .kunj-grid .input-field { width: 100%; box-sizing: border-box; }
        @media (max-width: 900px) {
          .kunj-grid .kspan-3, .kunj-grid .kspan-4 { grid-column: span 6; }
          .kunj-grid .kspan-6, .kunj-grid .kspan-8 { grid-column: span 12; }
        }
        @media (max-width: 600px) {
          .kunj-grid > div { grid-column: span 12 !important; }
        }
      `}</style>
    </div>
  );
}
