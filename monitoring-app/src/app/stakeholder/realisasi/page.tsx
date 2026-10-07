"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@/lib/authContext";
import {
  ACHIEVEMENT_CAP,
  INTEREST_LEVELS,
  INFLUENCE_LEVELS,
  achievementPercent,
  buildActivityPayload,
  kpi6Activities,
  kpiForQuadrant,
  quadrantFor,
  validateEntryDraft,
  type EntryDraft,
  type InterestLevel,
  type InfluenceLevel,
} from "@/lib/stakeholder";
import { validateStorageFile } from "@/lib/storage";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface LocalEntry extends EntryDraft {
  localId: string;
  evidenceNames: string[];
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid var(--card-border)",
  background: "var(--card-bg, #fff)",
  fontSize: "0.875rem",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "var(--text-muted)",
  marginBottom: "6px",
};

/**
 * Kerangka pengisian KPI 6 (Keep Satisfied + Monitor).
 * Satu entri = satu kegiatan; JUMLAH otomatis dari banyaknya entri.
 * Bukti baru berupa file (validasi tipe/ukuran); upload Storage + API
 * (/api/stakeholder-activities) menyusul — tombol kirim disabled dan
 * payload siap kirim ditampilkan sebagai pratinjau JSON.
 */
export default function StakeholderRealisasiPage() {
  const { user } = useAuth();
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());

  const activities = useMemo(() => kpi6Activities(), []);
  const [activityKey, setActivityKey] = useState(activities[0]?.key ?? "");
  const [tanggal, setTanggal] = useState(now.toISOString().slice(0, 10));
  const [judul, setJudul] = useState("");
  const [pengaruh, setPengaruh] = useState<InfluenceLevel | "">("");
  const [kepentingan, setKepentingan] = useState<InterestLevel | "">("");
  const [keterangan, setKeterangan] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const draftQuadrant =
    pengaruh && kepentingan ? quadrantFor(pengaruh, kepentingan) : null;
  const draftKpi = draftQuadrant ? kpiForQuadrant(draftQuadrant) : null;

  const countFor = (key: string) =>
    entries.filter((e) => e.activityKey === key).length;

  const handleAdd = () => {
    const draft: EntryDraft = {
      activityKey, tanggal, judul, pengaruh, kepentingan, keterangan,
    };
    const err = validateEntryDraft(draft);
    if (err) {
      setError(err);
      return;
    }
    for (const f of files) {
      const ferr = validateStorageFile(f);
      if (ferr) {
        setError(`Bukti "${f.name}": ${ferr}`);
        return;
      }
    }
    setEntries((prev) => [
      ...prev,
      {
        ...draft,
        localId:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${prev.length}`,
        evidenceNames: files.map((f) => f.name),
      },
    ]);
    setJudul("");
    setKeterangan("");
    setFiles([]);
    setError(null);
  };

  const payloadPreview = entries.map((e) =>
    buildActivityPayload(e, {
      unitId: user?.unitId || "-",
      authorUid: user?.uid || "-",
      bulan,
      tahun,
    })
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>
          Realisasi KPI 6
        </h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Unit: <b>{user?.unitId || "-"}</b> • Keep Satisfied + Monitor
          (Audiensi, Sapa Personal, Share WAG, Influencer)
        </p>
      </header>

      {/* Periode */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={labelStyle}>BULAN</label>
            <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} style={inputStyle}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>TAHUN</label>
            <input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>
      </section>

      {/* Form tambah kegiatan */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          Tambah kegiatan
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label style={labelStyle}>JENIS KEGIATAN</label>
            <select value={activityKey} onChange={(e) => setActivityKey(e.target.value)} style={inputStyle}>
              {activities.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label} ({a.quadrant} • {a.targetLabel})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>TANGGAL</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>JUDUL KEGIATAN (MIN. 10 KARAKTER)</label>
          <input
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="cth: Pertemuan informal monitoring pemakaian kompor listrik Ibu Diana"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label style={labelStyle}>TINGKAT PENGARUH</label>
            <select value={pengaruh} onChange={(e) => setPengaruh(e.target.value as InfluenceLevel)} style={inputStyle}>
              <option value="">— pilih —</option>
              {INFLUENCE_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>TINGKAT KEPENTINGAN</label>
            <select value={kepentingan} onChange={(e) => setKepentingan(e.target.value as InterestLevel)} style={inputStyle}>
              <option value="">— pilih —</option>
              {INTEREST_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        {draftQuadrant && (
          <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: draftKpi === 6 ? "var(--success)" : "var(--danger)" }}>
            Sistem: kuadran <b>{draftQuadrant}</b> → KPI <b>{draftKpi}</b>
            {draftKpi !== 6 && " — kombinasi ini di luar KPI 6."}
          </p>
        )}
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>KETERANGAN KEPENTINGAN (MIN. 20 KARAKTER)</label>
          <textarea
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            rows={3}
            placeholder="Jelaskan pengaruh dan kepentingan stakeholder terhadap program PLN"
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>BUKTI (PDF/GAMBAR, MAKS. 10 MB/FILE)</label>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            style={inputStyle}
          />
          {files.length > 0 && (
            <p style={{ margin: "8px 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {files.length} file dipilih: {files.map((f) => f.name).join(", ")}
            </p>
          )}
        </div>
        {error && (
          <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--danger)", fontWeight: 600 }}>
            {error}
          </p>
        )}
        <button
          onClick={handleAdd}
          style={{
            padding: "10px 20px", borderRadius: "10px", border: "none",
            background: "var(--primary)", color: "#fff",
            fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
          }}
        >
          Tambah ke daftar
        </button>
      </section>

      {/* Ringkasan otomatis */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          Ringkasan {MONTHS[bulan - 1]} {tahun}
        </h2>
        <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          JUMLAH otomatis dari entri • capaian cap {Math.round(ACHIEVEMENT_CAP * 100)}%
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {["KEGIATAN", "TARGET", "JUMLAH", "CAPAIAN"].map((c) => (
                <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => {
              const jumlah = countFor(a.key);
              const capaian = achievementPercent(jumlah, a.target);
              return (
                <tr key={a.key} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                    {a.label} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({a.targetLabel})</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{a.target}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{jumlah}</td>
                  <td style={{ padding: "10px 12px", color: jumlah >= a.target ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                    {capaian.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Daftar entri */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          Daftar entri ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Belum ada entri. Tambahkan kegiatan lewat form di atas.
          </p>
        ) : (
          entries.map((e) => {
            const act = activities.find((a) => a.key === e.activityKey);
            return (
              <div key={e.localId} style={{ borderBottom: "1px solid var(--card-border)", padding: "12px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{e.judul}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {act?.label} • {e.tanggal} • {e.pengaruh}/{e.kepentingan}
                      {e.evidenceNames.length > 0 && ` • ${e.evidenceNames.length} bukti: ${e.evidenceNames.join(", ")}`}
                    </div>
                  </div>
                  <button
                    onClick={() => setEntries((prev) => prev.filter((x) => x.localId !== e.localId))}
                    style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Pratinjau payload API */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          Pratinjau payload API
        </h2>
        <p style={{ margin: "0 0 12px 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Tombol kirim aktif setelah <code>/api/stakeholder-activities</code> tersedia
          (rules masih <code>write: false</code>).
        </p>
        <pre style={{ margin: 0, padding: "16px", borderRadius: "10px", background: "var(--bg, #0f172a)", color: "#e2e8f0", fontSize: "0.75rem", overflowX: "auto", maxHeight: "320px", overflowY: "auto" }}>
          {JSON.stringify(payloadPreview, null, 2)}
        </pre>
        <button
          disabled
          title="API /api/stakeholder-activities menyusul"
          style={{
            marginTop: "16px", padding: "10px 20px", borderRadius: "10px",
            border: "1px solid var(--card-border)", background: "var(--card-bg, #f1f5f9)",
            color: "var(--text-muted)", fontWeight: 700, fontSize: "0.875rem", cursor: "not-allowed",
          }}
        >
          Kirim ke server (menyusul)
        </button>
      </section>
    </div>
  );
}
