"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  capForKpi,
  clusterForUnit,
  targetFor,
  INTEREST_LEVELS,
  INFLUENCE_LEVELS,
  achievementPercent,
  buildActivityPayload,
  kpiActivities,
  kpiForQuadrantStrict,
  quadrantFor,
  realisasiLevel,
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

/** Satu field dalam grid 12 kolom (pola form kunjungan PUMK). */
const Field = ({
  label,
  hint,
  span,
  children,
}: {
  label: string;
  hint?: string;
  span: 3 | 4 | 6 | 8 | 12;
  children: React.ReactNode;
}) => (
  <div className={`kspan-${span}`}>
    <label style={labelStyle} title={label}>{label}</label>
    {children}
    {hint && <div style={hintStyle}>{hint}</div>}
  </div>
);

/**
 * Pengisian KPI 5 & 6 — pengganti sheet.
 * Satu entri = satu kegiatan; JUMLAH otomatis dari banyaknya entri.
 * Bukti baru berupa file (validasi tipe/ukuran); upload Storage + API
 * (/api/stakeholder-activities) menyusul — tombol kirim disabled dan
 * payload siap kirim ditampilkan sebagai pratinjau JSON.
 * Target mengikuti cluster unit (A/B); cap KPI 5 = 110%, KPI 6 = 100%.
 */
export default function StakeholderRealisasiPage() {
  const { user } = useAuth();
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [kpi, setKpi] = useState<5 | 6>(6);

  const activities = useMemo(() => kpiActivities(kpi), [kpi]);
  const cluster = clusterForUnit(user?.unitId);
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
  const draftKpi = draftQuadrant ? kpiForQuadrantStrict(draftQuadrant) : null;

  const targetOf = (key: string) => {
    const base = activities.find((a) => a.key === key)?.target ?? 0;
    const t = targetFor(kpi, key, cluster);
    return t > 0 ? t : base;
  };

  const countFor = (key: string) =>
    entries.filter((e) => e.activityKey === key).length;

  const handleAdd = () => {
    const draft: EntryDraft = {
      activityKey, tanggal, judul, pengaruh, kepentingan, keterangan,
    };
    const err = validateEntryDraft(draft, kpi);
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
          Realisasi KPI {kpi}
        </h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Unit: <b>{user?.unitId || "-"}</b> • Cluster {cluster} •{" "}
          {kpi === 5 ? "Manage Closely + Keep Informed" : "Keep Satisfied + Monitor"} • cap{" "}
          {Math.round(capForKpi(kpi) * 100)}%
        </p>
        <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
          {[5, 6].map((v) => (
            <button
              key={v}
              onClick={() => {
                setKpi(v as 5 | 6);
                const first = kpiActivities(v as 5 | 6)[0]?.key ?? "";
                setActivityKey(first);
                setEntries([]);
                setError(null);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "10px",
                border: "1px solid var(--card-border)",
                background: kpi === v ? "var(--primary)" : "transparent",
                color: kpi === v ? "#fff" : "var(--text-muted)",
                fontWeight: 700,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              KPI {v}
            </button>
          ))}
        </div>
      </header>

      {/* Form tambah kegiatan (pola form kunjungan PUMK: grid 12 kolom + seksi berjudul) */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          Tambah kegiatan
        </h2>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "0.95rem", fontWeight: 700 }}>
          Periode pelaporan
        </h3>
        <div className="kunj-grid">
          <Field label="Bulan" span={4}>
            <select className="input-field" value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Tahun" span={4}>
            <input className="input-field" type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
          </Field>
          <Field label="Tanggal kegiatan" span={4}>
            <input className="input-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </Field>
        </div>

        <h3 style={{ margin: "20px 0 12px 0", fontSize: "0.95rem", fontWeight: 700 }}>
          Jenis kegiatan
        </h3>
        <div className="kunj-grid">
          <Field label="Jenis kegiatan" span={8} hint={draftQuadrant ? `Kuadran ${draftQuadrant} → KPI ${draftKpi}` : "Pilih pengaruh & kepentingan untuk melihat kuadran"}>
            <select className="input-field" value={activityKey} onChange={(e) => setActivityKey(e.target.value)}>
              {activities.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label} ({a.quadrant} • {a.targetLabel})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target" span={4} hint={`Cluster ${cluster} • cap ${Math.round(capForKpi(kpi) * 100)}%`}>
            <input className="input-field" value={targetOf(activityKey)} disabled readOnly />
          </Field>
        </div>

        <h3 style={{ margin: "20px 0 12px 0", fontSize: "0.95rem", fontWeight: 700 }}>
          Klasifikasi stakeholder
        </h3>
        <div className="kunj-grid">
          <Field label="Tingkat pengaruh" span={6}>
            <select className="input-field" value={pengaruh} onChange={(e) => setPengaruh(e.target.value as InfluenceLevel)}>
              <option value="">— pilih —</option>
              {INFLUENCE_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Tingkat kepentingan" span={6}>
            <select className="input-field" value={kepentingan} onChange={(e) => setKepentingan(e.target.value as InterestLevel)}>
              <option value="">— pilih —</option>
              {INTEREST_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
        {draftQuadrant && (
          <p style={{ margin: "8px 0 0 0", fontSize: "0.82rem", color: draftKpi === kpi ? "var(--success)" : "var(--danger)" }}>
            Sistem: kuadran <b>{draftQuadrant}</b> → KPI <b>{draftKpi}</b> • Cluster {cluster} • target{" "}
            <b>{targetOf(activityKey)}</b>/bulan
            {draftKpi !== kpi && ` — kombinasi ini di luar KPI ${kpi}.`}
          </p>
        )}

        <h3 style={{ margin: "20px 0 12px 0", fontSize: "0.95rem", fontWeight: 700 }}>
          Detail & bukti
        </h3>
        <div className="kunj-grid">
          <Field label="Judul kegiatan (min. 10 karakter)" span={12}>
            <input
              className="input-field"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
            />
          </Field>
          <Field label="Keterangan kepentingan (min. 20 karakter)" span={12}>
            <textarea
              className="input-field"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              rows={3}
              style={{ resize: "vertical" }}
            />
          </Field>
          <Field
            label="Bukti (PDF/gambar, maks. 10 MB/file)"
            span={12}
            hint={files.length > 0 ? `${files.length} file dipilih: ${files.map((f) => f.name).join(", ")}` : undefined}
          >
            <input
              className="input-field"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </Field>
        </div>
        {error && (
          <p style={{ margin: "16px 0 0 0", fontSize: "0.85rem", color: "var(--danger)", fontWeight: 600 }}>
            {error}
          </p>
        )}
        <div style={{ marginTop: "16px" }}>
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
        </div>
      </section>

      {/* Ringkasan otomatis */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          Ringkasan {MONTHS[bulan - 1]} {tahun}
        </h2>
        <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          JUMLAH otomatis dari entri • capaian cap {Math.round(capForKpi(kpi) * 100)}% • Level 1-5 (4 = target)
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {["KEGIATAN", "TARGET", "JUMLAH", "CAPAIAN", "LEVEL"].map((c) => (
                <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => {
              const jumlah = countFor(a.key);
              const target = targetFor(kpi, a.key, cluster);
              const capaian = achievementPercent(jumlah, target, kpi);
              const level = realisasiLevel(jumlah, target);
              return (
                <tr key={a.key} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                    {a.label} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({a.targetLabel})</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{target}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{jumlah}</td>
                  <td style={{ padding: "10px 12px", color: jumlah >= target ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                    {capaian.toFixed(0)}%
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: level >= 4 ? "var(--success)" : level === 3 ? "var(--warning)" : "var(--danger)" }}>
                    {level}
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
