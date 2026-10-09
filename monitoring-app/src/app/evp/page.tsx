"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { EVP_KATEGORI } from "@/lib/evp";
import {
  getProvinces,
  getRegencies,
  getDistrictMap,
  getVillageMap,
  type Wilayah,
} from "@/lib/wilayah";
import { UNIT_OPTIONS, formatUnitDisplay } from "@/lib/roles";

interface Report {
  id: string;
  unitId: string;
  namaPegawai: string;
  nip: string;
  kategoriProgram: string;
  namaProgram: string;
  lokasiKota: string;
  lokasiProvinsi: string;
  tanggalPelaksanaan: string;
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

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontSize: "0.85rem",
  fontWeight: 500,
  color: "#0284c7",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--text-muted)",
  marginTop: "4px",
};

/** Satu field dalam grid 12 kolom (top-level agar input tidak kehilangan fokus saat mengetik). */
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

export default function EvpPage() {
  const { user, getToken } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [bulan, setBulan] = useState(currentMonth());
  const [fUnit, setFUnit] = useState("");

  // Form (cerminan form volunteer TJSL; identitas diprefill dari profil)
  const [namaPegawai, setNamaPegawai] = useState("");
  const [nip, setNip] = useState("");
  const [noHp, setNoHp] = useState("");
  const [unitAsal, setUnitAsal] = useState("UID JAKARTA RAYA");
  const [upDetail, setUpDetail] = useState("");
  const [kategori, setKategori] = useState("");
  const [namaProgram, setNamaProgram] = useState("");
  const [provinsi, setProvinsi] = useState("");
  const [kota, setKota] = useState("");
  const [kecamatan, setKecamatan] = useState("");
  const [kelurahan, setKelurahan] = useState("");
  // Dropdown berjenjang (API wilayah gratis). Tiap level yang gagal dimuat
  // otomatis jadi teks bebas agar form tetap bisa diisi.
  const [provList, setProvList] = useState<Wilayah[]>([]);
  const [kotaList, setKotaList] = useState<Wilayah[]>([]);
  const [kecList, setKecList] = useState<Wilayah[]>([]);
  const [kelList, setKelList] = useState<Wilayah[]>([]);
  const [provId, setProvId] = useState("");
  const [kotaId, setKotaId] = useState("");
  const [kecId, setKecId] = useState("");
  const [kelId, setKelId] = useState("");
  // Peta regencyId -> kecamatan dan districtId -> kelurahan se-provinsi
  // (file lokal, tanpa API eksternal).
  const [distMap, setDistMap] = useState<Record<string, Wilayah[]>>({});
  const [vilMap, setVilMap] = useState<Record<string, Wilayah[]>>({});
  const [wilLoading, setWilLoading] = useState("");
  const [kotaText, setKotaText] = useState(false);
  const [kecText, setKecText] = useState(false);
  const [kelText, setKelText] = useState(false);
  const [evidenFile, setEvidenFile] = useState<File | null>(null);
  const [tanggal, setTanggal] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "administrator" || user?.role === "admin_uid" || (user?.role as string) === "admin";
  const isSuperAdmin = user?.role === "administrator" || (user?.role as string) === "admin";
  const isUnitRole = user?.role === "staff" || user?.role === "team_leader" || user?.role === "asman";
  const canInput = isUnitRole || isSuperAdmin;

  // Prefill identitas dari profil login.
  useEffect(() => {
    if (!user) return;
    if (user.name) setNamaPegawai((v) => v || user.name || "");
    if (user.nip) setNip((v) => v || user.nip || "");
    if (user.unitId) setUpDetail((v) => v || formatUnitDisplay(user.unitId));
  }, [user]);

  // Muat daftar provinsi sekali saat halaman dibuka (ada bawaan statis).
  useEffect(() => {
    getProvinces().then(setProvList).catch(() => setProvList([]));
  }, []);

  const pickName = (list: Wilayah[], id: string) =>
    list.find((w) => w.id === id)?.name || "";

  const resetBelowKota = () => {
    setKotaId(""); setKota(""); setKotaList([]);
    setKecId(""); setKecamatan(""); setKecList([]);
    setKelId(""); setKelurahan(""); setKelList([]);
  };

  const onProvChange = async (id: string) => {
    setProvId(id);
    setProvinsi(pickName(provList, id));
    resetBelowKota();
    setDistMap({});
    setVilMap({});
    if (!id) return;
    try {
      setWilLoading("kota");
      const [regs, dmap, vmap] = await Promise.all([
        getRegencies(id),
        getDistrictMap(id),
        getVillageMap(id),
      ]);
      setKotaList(regs);
      setDistMap(dmap);
      setVilMap(vmap);
      setKotaText(false); setKecText(false); setKelText(false);
    } catch {
      setKotaText(true); setKecText(true); setKelText(true);
    } finally {
      setWilLoading("");
    }
  };

  const onKotaChange = async (id: string) => {
    setKotaId(id);
    setKota(pickName(kotaList, id));
    setKecId(""); setKecamatan(""); setKecList(distMap[id] || []);
    setKelId(""); setKelurahan(""); setKelList([]);
    setKecText(false);
    if (!(distMap[id] || []).length && id) setKecText(true);
  };

  const onKecChange = (id: string) => {
    setKecId(id);
    setKecamatan(pickName(kecList, id));
    setKelId(""); setKelurahan(""); setKelList(vilMap[id] || []);
    setKelText(false);
    if (!(vilMap[id] || []).length && id) setKelText(true);
  };

  const onKelChange = (id: string) => {
    setKelId(id);
    setKelurahan(pickName(kelList, id));
  };

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
      const res = await fetch(`/api/evp-reports?${q.toString()}`, { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setReports(data.reports || []);
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
    setNoHp(""); setNamaProgram("");
    setProvinsi(""); setKota(""); setKecamatan(""); setKelurahan("");
    setProvId(""); setKotaId(""); setKecId(""); setKelId("");
    setKotaList([]); setKecList([]); setKelList([]);
    setDistMap({}); setVilMap({}); setKotaText(false); setKecText(false); setKelText(false);
    setEvidenFile(null); setDeskripsi(""); setKategori(""); setTanggal("");
  };

  const handleCreate = async () => {
    if (!namaPegawai.trim() || !nip.trim() || !noHp.trim() || !namaProgram.trim() || !deskripsi.trim()) {
      setError("Nama pegawai, NIP, No HP, nama program, dan deskripsi wajib diisi.");
      return;
    }
    if (!/^\d{9,15}$/.test(noHp.trim())) {
      setError("No HP hanya boleh angka (9–15 digit).");
      return;
    }
    if (!provinsi.trim() || !kota.trim() || !kecamatan.trim() || !kelurahan.trim()) {
      setError("Lokasi kegiatan (provinsi/kota/kecamatan/kelurahan) wajib diisi.");
      return;
    }
    if (!kategori) {
      setError("Kategori program wajib dipilih.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      setError("Tanggal pelaksanaan wajib diisi.");
      return;
    }
    try {
      setSaving(true);
      // Kerangka tampilan saja: file eviden BELUM diupload ke mana pun.
      await callApi("/api/evp-reports", "POST", {
        namaPegawai, nip, noHp, unitAsal, upDetail,
        kategoriProgram: kategori, namaProgram,
        lokasiProvinsi: provinsi, lokasiKota: kota,
        lokasiKecamatan: kecamatan, lokasiKelurahan: kelurahan,
        evidenUrl: null,
        tanggalPelaksanaan: tanggal,
        deskripsi,
      });
      setMsg("Laporan EVP tersimpan sebagai draf. (Upload eviden belum aktif — tampilan saja.)");
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (r: Report, action: string) => {
    let note: string | undefined;
    if (action === "reject") {
      const n = prompt(`Tolak laporan "${r.namaProgram}"? Catatan:`);
      if (n === null) return;
      note = n;
    } else if (action === "approve") {
      if (!confirm(`Setujui laporan "${r.namaProgram}"?`)) return;
    } else if (action === "delete") {
      if (!confirm(`Hapus laporan "${r.namaProgram}"?`)) return;
      try {
        await callApi(`/api/evp-reports/${r.id}`, "DELETE");
        setMsg("Laporan dihapus.");
        await loadData();
      } catch (err: any) { setError(err.message); }
      return;
    }
    try {
      await callApi(`/api/evp-reports/${r.id}`, "PATCH", note !== undefined ? { action, note } : { action });
      setMsg(action === "submit" ? "Diajukan untuk review." : action === "approve" ? "Laporan disetujui." : "Laporan ditolak.");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const canReview = (r: Report) => {
    if (isAdmin) return r.status === "pending";
    if ((user?.role === "team_leader" || user?.role === "asman") && r.unitId === user?.unitId && r.authorUid !== user?.uid) {
      return r.status === "pending";
    }
    return false;
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>EVP</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Laporan Employee Volunteer Program • unit {isAdmin ? "semua" : <b>{user?.unitId}</b>} • draf → review → rekap.
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
        <section className="glass-panel" style={{ padding: "24px 28px", marginBottom: "24px", background: "#fff" }}>
          <h2 style={{ margin: "0 0 20px 0", fontSize: "1.15rem", fontWeight: 700, textAlign: "center", color: "#1f2937" }}>Laporan Employee Volunteer Program TJSL PLN APPS</h2>
          <div className="kunj-grid">
            <Field label="Nama Pegawai" span={6}>
              <input className="input-field" value={namaPegawai} onChange={(e) => setNamaPegawai(e.target.value)} />
            </Field>
            <Field label="NIP" span={6}>
              <input className="input-field" value={nip} onChange={(e) => setNip(e.target.value)} />
            </Field>
            <Field label="No Hp" span={6}>
              <input
                className="input-field"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel"
                maxLength={15}
                placeholder="cth: 081234567890"
                value={noHp}
                onChange={(e) => setNoHp(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Unit Asal" span={6}>
              <select className="input-field" value={unitAsal} onChange={(e) => setUnitAsal(e.target.value)}>
                <option value="UID JAKARTA RAYA">UID JAKARTA RAYA</option>
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="UP3/UPT/UPP/UPDL/Sektor" span={6}>
              <input className="input-field" value={upDetail} onChange={(e) => setUpDetail(e.target.value)} />
            </Field>
            <Field label="Kategori Program" span={6}>
              <select className="input-field" value={kategori} onChange={(e) => setKategori(e.target.value)}>
                <option value="">Pilih...</option>
                {EVP_KATEGORI.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Nama Program" span={6}>
              <input className="input-field" value={namaProgram} onChange={(e) => setNamaProgram(e.target.value)} />
            </Field>
            <Field label="Lokasi Kegiatan (Provinsi)" span={6}>
              <select className="input-field" value={provId} onChange={(e) => onProvChange(e.target.value)}>
                <option value="">Pilih Provinsi...</option>
                {provList.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            {kotaText ? (
              <Field label="Lokasi Kegiatan (Kabupaten/Kota)" span={6} hint="Daftar tidak termuat — isi manual">
                <input className="input-field" value={kota} onChange={(e) => setKota(e.target.value)} />
              </Field>
            ) : (
              <Field label="Lokasi Kegiatan (Kabupaten/Kota)" span={6} hint={wilLoading === "kota" ? "Memuat..." : undefined}>
                <select className="input-field" value={kotaId} onChange={(e) => onKotaChange(e.target.value)} disabled={!provId}>
                  <option value="">Pilih...</option>
                  {kotaList.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            )}
            {kecText ? (
              <Field label="Lokasi Kegiatan (Kecamatan)" span={6} hint="Daftar tidak termuat — isi manual">
                <input className="input-field" value={kecamatan} onChange={(e) => setKecamatan(e.target.value)} />
              </Field>
            ) : (
              <Field label="Lokasi Kegiatan (Kecamatan)" span={6} hint={wilLoading === "kecamatan" ? "Memuat..." : undefined}>
                <select className="input-field" value={kecId} onChange={(e) => onKecChange(e.target.value)} disabled={!kotaId}>
                  <option value="">Pilih...</option>
                  {kecList.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            )}
            {kelText ? (
              <Field label="Lokasi Kegiatan (Kelurahan)" span={6} hint="Daftar tidak termuat — isi manual">
                <input className="input-field" value={kelurahan} onChange={(e) => setKelurahan(e.target.value)} />
              </Field>
            ) : (
              <Field label="Lokasi Kegiatan (Kelurahan)" span={6} hint={wilLoading === "kelurahan" ? "Memuat..." : undefined}>
                <select className="input-field" value={kelId} onChange={(e) => onKelChange(e.target.value)} disabled={!kecId}>
                  <option value="">Pilih...</option>
                  {kelList.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            )}
            <Field
              label="Eviden Kegiatan"
              span={6}
              hint={evidenFile ? `${evidenFile.name} (${(evidenFile.size / 1024).toFixed(0)} KB)` : undefined}
            >
              <input className="input-field" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setEvidenFile(e.target.files?.[0] || null)} />
            </Field>
            <Field label="Tanggal Pelaksanaan" span={6}>
              <input className="input-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </Field>
            <Field label="Deskripsi Kegiatan" span={12}>
              <textarea className="input-field" rows={6} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} style={{ resize: "vertical" }} />
            </Field>
          </div>

          <div style={{ marginTop: "16px" }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan draf"}
            </button>
          </div>
          <p style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Identitas diprefill dari akun login. Pilih file eviden hanya tampilan — upload belum aktif.
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
                {["TANGGAL", "PEGAWAI", "PROGRAM", "KATEGORI", "LOKASI", "STATUS", "AKSI"].map((c) => (
                  <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Memuat...</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Belum ada laporan bulan ini.</td></tr>
              ) : reports.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{r.tanggalPelaksanaan}</td>
                  <td style={{ padding: "10px 12px" }}>{r.namaPegawai}</td>
                  <td style={{ padding: "10px 12px" }}>{r.namaProgram}</td>
                  <td style={{ padding: "10px 12px" }}>{r.kategoriProgram}</td>
                  <td style={{ padding: "10px 12px" }}>{r.lokasiKota}{r.lokasiProvinsi ? `, ${r.lokasiProvinsi}` : ""}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, color: "white",
                      background: r.status === "approved" ? "#10b981" : r.status === "pending" ? "#f59e0b" : r.status === "rejected" ? "#ef4444" : "#6b7280" }}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <select
                      className="input-field"
                      defaultValue=""
                      onChange={(ev) => { const val = ev.target.value; ev.target.value = ""; if (val) handleAction(r, val); }}
                      style={{ padding: "6px 10px", fontSize: "0.8rem", minWidth: "130px" }}
                    >
                      <option value="">— Aksi —</option>
                      {r.authorUid === user?.uid && r.status === "draft" && <option value="submit">Ajukan review</option>}
                      {canReview(r) && <option value="approve">Setujui</option>}
                      {canReview(r) && <option value="reject">Tolak</option>}
                      {((r.authorUid === user?.uid && (r.status === "draft" || r.status === "rejected")) || isAdmin) && (
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
