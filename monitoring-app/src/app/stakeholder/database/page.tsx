"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import {
  STAKEHOLDER_QUADRANTS,
  STAKEHOLDER_SIKAP_OPTIONS,
  stakeholderCompleteness,
} from "@/lib/stakeholder";
import { UNIT_OPTIONS } from "@/lib/roles";

interface StakeholderRow {
  id: string;
  unitId: string;
  instansi: string;
  alamat: string;
  namaPimpinan: string;
  telpKantor: string;
  noHpPimpinan?: string | null;
  tglUltahPimpinan?: string | null;
  namaPic: string;
  noHpPic?: string | null;
  hutLembaga: string;
  isu: string;
  sikap: string;
  quadrant: string;
  tujuan: string;
  metode: string;
  pelaksana: string;
  waktu: string;
  tarifDaya: string;
  pemeliharaan?: string | null;
  mouPks: string;
  kerjasamaAnak: string;
}

const EMPTY = {
  instansi: "",
  alamat: "",
  namaPimpinan: "",
  telpKantor: "",
  noHpPimpinan: "",
  tglUltahPimpinan: "",
  namaPic: "",
  noHpPic: "",
  hutLembaga: "",
  isu: "",
  sikap: "",
  quadrant: "",
  tujuan: "",
  metode: "",
  pelaksana: "",
  waktu: "",
  tarifDaya: "",
  pemeliharaan: "",
  mouPks: "",
  kerjasamaAnak: "",
};

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="kspan-12" style={{ marginTop: "8px" }}>
      <h3 style={{ margin: "8px 0 0 0", fontSize: "0.95rem", fontWeight: 700, color: "#1f2937", borderBottom: "1px solid var(--card-border)", paddingBottom: "6px" }}>
        {children}
      </h3>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "8px", padding: "7px 0", borderBottom: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
      <div style={{ color: "var(--text-muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{children || <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: "14px" }}>
      <h4 style={{ margin: "0 0 4px 0", fontSize: "0.85rem", fontWeight: 700, color: "#0284c7" }}>{title}</h4>
      {children}
    </div>
  );
}

/** Modal rincian 20 kolom SPS — dibuka saat baris daftar diklik (bukan tombol Ubah). */
function StakeholderDetailModal({
  row,
  unitLabel,
  onClose,
  onEdit,
}: {
  row: StakeholderRow;
  unitLabel: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", maxWidth: "640px", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "24px 28px" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "8px" }}>
          <div style={{ marginRight: "auto" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>{row.instansi}</h3>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
              {unitLabel} • {row.quadrant} • kelengkapan {stakeholderCompleteness(row as any)}%
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
            ✕ Tutup
          </button>
        </div>

        <DetailSection title="Identitas lembaga">
          <DetailRow label="Alamat kantor">{row.alamat}</DetailRow>
          <DetailRow label="Nama pimpinan">{row.namaPimpinan}</DetailRow>
          <DetailRow label="Telp kantor">{row.telpKantor}</DetailRow>
          <DetailRow label="HUT lembaga">{row.hutLembaga}</DetailRow>
          <DetailRow label="Isu">{row.isu}</DetailRow>
        </DetailSection>

        <DetailSection title="Kontak">
          <DetailRow label="No HP pimpinan">{row.noHpPimpinan}</DetailRow>
          <DetailRow label="Tgl ultah pimpinan">{row.tglUltahPimpinan}</DetailRow>
          <DetailRow label="Nama PIC">{row.namaPic}</DetailRow>
          <DetailRow label="No HP PIC">{row.noHpPic}</DetailRow>
        </DetailSection>

        <DetailSection title="Klasifikasi & pengelolaan">
          <DetailRow label="Sikap stakeholder">{row.sikap}</DetailRow>
          <DetailRow label="Maping kuadran">{row.quadrant}</DetailRow>
          <DetailRow label="Tujuan">{row.tujuan}</DetailRow>
          <DetailRow label="Metode">{row.metode}</DetailRow>
          <DetailRow label="Pelaksana">{row.pelaksana}</DetailRow>
          <DetailRow label="Waktu">{row.waktu}</DetailRow>
        </DetailSection>

        <DetailSection title="Listrik & kerjasama">
          <DetailRow label="Tarif / daya">{row.tarifDaya}</DetailRow>
          <DetailRow label="Pemeliharaan">{row.pemeliharaan}</DetailRow>
          <DetailRow label="MOU / PKS">{row.mouPks}</DetailRow>
          <DetailRow label="Kerjasama anak prshn">{row.kerjasamaAnak}</DetailRow>
        </DetailSection>

        <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
          <button className="btn btn-primary" onClick={onEdit}>Ubah data ini</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Database Stakeholder — pengganti tab SPS per UP3/UP2D (20 kolom).
 * - Unit (staff/team_leader/asman): hanya melihat + mengisi daftar unitnya sendiri.
 * - Admin UID/administrator: melihat semua unit (filter unit) + boleh mengisi ke unit mana pun.
 * Tanda (-) = opsional sesuai catatan Rekap (tidak mengurangi % kelengkapan secara penalti).
 */
export default function StakeholderDatabasePage() {
  const { user, getToken } = useAuth();
  const [items, setItems] = useState<StakeholderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [fUnit, setFUnit] = useState("");
  const [fQuery, setFQuery] = useState("");
  const [form, setForm] = useState({ ...EMPTY });
  const [detail, setDetail] = useState<StakeholderRow | null>(null);

  const isAdmin =
    user?.role === "administrator" ||
    user?.role === "admin_uid" ||
    (user?.role as string) === "admin";
  const canInput =
    user?.role === "staff" ||
    user?.role === "team_leader" ||
    user?.role === "asman" ||
    isAdmin;

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
      const q = new URLSearchParams();
      if (isAdmin && fUnit) q.set("unitId", fUnit);
      const res = await fetch(`/api/stakeholders?${q.toString()}`, {
        headers: await authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setItems(data.stakeholders || []);
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
  }, [user, fUnit]);

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
    setForm({ ...EMPTY });
    setEditingId(null);
  };

  const startEdit = (r: StakeholderRow) => {
    setForm({
      instansi: r.instansi || "",
      alamat: r.alamat || "",
      namaPimpinan: r.namaPimpinan || "",
      telpKantor: r.telpKantor || "",
      noHpPimpinan: r.noHpPimpinan || "",
      tglUltahPimpinan: r.tglUltahPimpinan || "",
      namaPic: r.namaPic || "",
      noHpPic: r.noHpPic || "",
      hutLembaga: r.hutLembaga || "",
      isu: r.isu || "",
      sikap: r.sikap || "",
      quadrant: r.quadrant || "",
      tujuan: r.tujuan || "",
      metode: r.metode || "",
      pelaksana: r.pelaksana || "",
      waktu: r.waktu || "",
      tarifDaya: r.tarifDaya || "",
      pemeliharaan: r.pemeliharaan || "",
      mouPks: r.mouPks || "",
      kerjasamaAnak: r.kerjasamaAnak || "",
    });
    setEditingId(r.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    const required: (keyof typeof EMPTY)[] = [
      "instansi", "alamat", "namaPimpinan", "telpKantor", "namaPic",
      "hutLembaga", "isu", "sikap", "tujuan", "metode", "pelaksana",
      "waktu", "tarifDaya", "mouPks", "kerjasamaAnak",
    ];
    for (const k of required) {
      if (!form[k].trim()) {
        setError(`Field "${k}" wajib diisi.`);
        return;
      }
    }
    if (!(STAKEHOLDER_QUADRANTS as readonly string[]).includes(form.quadrant)) {
      setError("Maping kuadran wajib dipilih.");
      return;
    }
    try {
      setSaving(true);
      const payload: Record<string, string> = { ...form };
      // Admin mengisi ke unit yang sedang difilter; unit mengisi unitnya sendiri (server memaksa).
      if (isAdmin && fUnit) payload.unitId = fUnit;
      if (editingId) {
        await callApi(`/api/stakeholders/${editingId}`, "PATCH", payload);
        setMsg("Data stakeholder diperbarui.");
      } else {
        await callApi("/api/stakeholders", "POST", payload);
        setMsg("Stakeholder ditambahkan ke daftar unit Anda.");
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: StakeholderRow) => {
    if (!confirm(`Hapus "${r.instansi}" dari daftar?`)) return;
    try {
      await callApi(`/api/stakeholders/${r.id}`, "DELETE");
      setMsg("Data dihapus.");
      if (editingId === r.id) resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filtered = items.filter((r) => {
    if (!fQuery.trim()) return true;
    const q = fQuery.trim().toLowerCase();
    return [r.instansi, r.namaPimpinan, r.namaPic, r.sikap, r.quadrant]
      .join(" ").toLowerCase().includes(q);
  });
  const avg = items.length
    ? Math.round(items.reduce((a, r) => a + stakeholderCompleteness(r as any), 0) / items.length)
    : 0;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Database Stakeholder</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          {isAdmin
            ? <>Semua unit • filter unit di bawah • {items.length} data • kelengkapan rata-rata <b>{avg}%</b></>
            : <>Unit <b>{user?.unitId}</b> • {items.length} data • kelengkapan rata-rata <b>{avg}%</b> • unit lain tidak terlihat</>}
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
          <h2 style={{ margin: "0 0 20px 0", fontSize: "1.15rem", fontWeight: 700, textAlign: "center", color: "#1f2937" }}>
            {editingId ? "Ubah Data Stakeholder" : "Tambah Stakeholder Unit"}
            {isAdmin && fUnit ? ` — ${fUnit}` : ""}
          </h2>
          <div className="kunj-grid">
            <SectionTitle>Identitas lembaga</SectionTitle>
            <Field label="Instansi / Lembaga / Perusahaan" span={6}>
              <input className="input-field" value={form.instansi} onChange={set("instansi")} placeholder="cth: Walikota Tangerang Selatan" />
            </Field>
            <Field label="Alamat Kantor" span={6}>
              <input className="input-field" value={form.alamat} onChange={set("alamat")} />
            </Field>
            <Field label="Nama Pimpinan" span={6}>
              <input className="input-field" value={form.namaPimpinan} onChange={set("namaPimpinan")} />
            </Field>
            <Field label="Nomor Telepon Kantor" span={6}>
              <input className="input-field" value={form.telpKantor} onChange={set("telpKantor")} placeholder="cth: (021) 74646336" />
            </Field>
            <Field label="Hari Ulang Tahun Lembaga" span={6}>
              <input className="input-field" value={form.hutLembaga} onChange={set("hutLembaga")} placeholder="cth: 26 November 2008" />
            </Field>
            <Field label="Isu" span={6}>
              <input className="input-field" value={form.isu} onChange={set("isu")} placeholder="cth: Sinergi PLN dengan Pemerintah" />
            </Field>

            <SectionTitle>Kontak (tanda (-) opsional)</SectionTitle>
            <Field label="No HP Pimpinan (-)" span={6} hint="Opsional. Boleh multi-nomor + nama, cth: 0812... (Dedi)">
              <input className="input-field" type="tel" value={form.noHpPimpinan} onChange={set("noHpPimpinan")} maxLength={120} />
            </Field>
            <Field label="Tgl Ulang Tahun Pimpinan (-)" span={6} hint="Opsional">
              <input className="input-field" value={form.tglUltahPimpinan} onChange={set("tglUltahPimpinan")} placeholder="cth: 01 September 1958" />
            </Field>
            <Field label="Nama PIC" span={6}>
              <input className="input-field" value={form.namaPic} onChange={set("namaPic")} />
            </Field>
            <Field label="No HP PIC (-)" span={6} hint="Opsional. Boleh multi-nomor + nama">
              <input className="input-field" type="tel" value={form.noHpPic} onChange={set("noHpPic")} maxLength={120} />
            </Field>

            <SectionTitle>Klasifikasi & pengelolaan</SectionTitle>
            <Field label="Sikap Stakeholder" span={6}>
              <input className="input-field" value={form.sikap} onChange={set("sikap")} list="sikap-list" placeholder="cth: PEMERINTAH" />
              <datalist id="sikap-list">
                {STAKEHOLDER_SIKAP_OPTIONS.map((o) => <option key={o} value={o} />)}
              </datalist>
            </Field>
            <Field label="Maping Kuadran" span={6}>
              <select className="input-field" value={form.quadrant} onChange={set("quadrant")}>
                <option value="">Pilih...</option>
                {STAKEHOLDER_QUADRANTS.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </Field>
            <Field label="Tujuan Pengelolaan" span={12}>
              <textarea className="input-field" rows={3} value={form.tujuan} onChange={set("tujuan")} style={{ resize: "vertical" }} />
            </Field>
            <Field label="Metode Pengelolaan" span={6}>
              <input className="input-field" value={form.metode} onChange={set("metode")} placeholder="cth: Silaturahmi, audiensi" />
            </Field>
            <Field label="Pelaksana" span={6}>
              <input className="input-field" value={form.pelaksana} onChange={set("pelaksana")} placeholder="cth: MUP3, Asman SAR" />
            </Field>
            <Field label="Waktu" span={6}>
              <input className="input-field" value={form.waktu} onChange={set("waktu")} placeholder="cth: Agustus 2023" />
            </Field>

            <SectionTitle>Listrik & kerjasama</SectionTitle>
            <Field label="Tarif / Daya Listrik" span={6}>
              <input className="input-field" value={form.tarifDaya} onChange={set("tarifDaya")} />
            </Field>
            <Field label="Pemeliharaan (-)" span={6} hint="Opsional">
              <input className="input-field" value={form.pemeliharaan} onChange={set("pemeliharaan")} />
            </Field>
            <Field label="MOU / PKS" span={6}>
              <input className="input-field" value={form.mouPks} onChange={set("mouPks")} />
            </Field>
            <Field label="Kerjasama Anak Perusahaan" span={6}>
              <input className="input-field" value={form.kerjasamaAnak} onChange={set("kerjasamaAnak")} />
            </Field>
          </div>

          <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? "Menyimpan..." : editingId ? "Simpan perubahan" : "Tambah stakeholder"}
            </button>
            {editingId && (
              <button className="btn" onClick={resetForm} style={{ background: "white", border: "1px solid var(--card-border)" }}>
                Batal ubah
              </button>
            )}
          </div>
        </section>
      )}

      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, marginRight: "auto" }}>
            Daftar Stakeholder {isAdmin && fUnit ? `— ${fUnit}` : isAdmin ? "— semua unit" : ""}
          </h2>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.8rem", fontWeight: 600 }}>Cari</label>
            <input className="input-field" value={fQuery} onChange={(e) => setFQuery(e.target.value)} placeholder="instansi / pimpinan / PIC" />
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
                {["INSTANSI", "PIMPINAN", "PIC", "KUADRAN", "SIKAP", "LENGKAP", "AKSI"].map((c) => (
                  <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Belum ada data. Tambahkan lewat form di atas.</td></tr>
              ) : filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setDetail(r)}
                  title="Klik untuk lihat rincian"
                  style={{ borderBottom: "1px solid var(--card-border)", cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(2, 132, 199, 0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{r.instansi}</div>
                    {isAdmin && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.unitId}</div>}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{r.namaPimpinan}</td>
                  <td style={{ padding: "10px 12px" }}>{r.namaPic}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{r.quadrant}</td>
                  <td style={{ padding: "10px 12px" }}>{r.sikap}</td>
                  <td style={{ padding: "10px 12px" }}>{stakeholderCompleteness(r as any)}%</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); startEdit(r); }} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.8rem", marginRight: "6px" }}>
                      Ubah
                    </button>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); handleDelete(r); }} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.8rem", color: "var(--danger)" }}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <StakeholderDetailModal
          row={detail}
          unitLabel={detail.unitId}
          onClose={() => setDetail(null)}
          onEdit={() => { const r = detail; setDetail(null); startEdit(r); }}
        />
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
