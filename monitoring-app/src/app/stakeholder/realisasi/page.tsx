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
  kpiActivities,
  kpiForQuadrantStrict,
  quadrantFor,
  realisasiLevel,
  validateEntryDraft,
  type EntryDraft,
  type InterestLevel,
  type InfluenceLevel,
} from "@/lib/stakeholder";
import { validateMediaFile } from "@/lib/mediaShared";
import { uploadMediaFile } from "@/lib/mediaClient";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface LocalEntry extends EntryDraft {
  localId: string;
  evidenceNames: string[];
  evidenceFiles: File[];
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
 * Bukti diunggah ke penyimpanan internal PC (path disimpan, bukan link), lalu
 * entri dikirim ke /api/stakeholder-activities sebagai pending_asman.
 * Target mengikuti cluster unit (A/B); cap KPI 5 = 110%, KPI 6 = 100%.
 */
export default function StakeholderRealisasiPage() {
  const { user, getToken } = useAuth();
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
  const [msg, setMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

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
      const ferr = validateMediaFile(f);
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
        evidenceFiles: files,
      },
    ]);
    setJudul("");
    setKeterangan("");
    setFiles([]);
    setError(null);
    setMsg(null);
    setSubmitError(null);
  };

  /** Kirim semua entri: buat dokumen → unggah bukti → ajukan ke Asman. */
  const handleSubmit = async () => {
    setSubmitError(null);
    setMsg(null);
    if (!entries.length) {
      setSubmitError("Tambahkan minimal satu kegiatan sebelum mengirim.");
      return;
    }
    if (!user?.unitId) {
      setSubmitError("Akun belum punya unit. Hubungi administrator.");
      return;
    }
    const token = await getToken();
    if (!token) {
      setSubmitError("Sesi login tidak ditemukan. Silakan login ulang.");
      return;
    }

    setSubmitting(true);
    const created: string[] = [];
    try {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        setProgress(`Entri ${i + 1}/${entries.length}: menyimpan...`);
        const res = await fetch("/api/stakeholder-activities", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            activityKey: e.activityKey,
            tanggal: e.tanggal,
            judul: e.judul,
            pengaruh: e.pengaruh,
            kepentingan: e.kepentingan,
            keterangan: e.keterangan,
            bulan,
            tahun,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `API ${res.status}`);
        const id = String(data?.id || "");
        if (!id) throw new Error("ID kegiatan tidak diterima dari server");
        created.push(id);

        const paths: string[] = [];
        const names: string[] = [];
        for (let j = 0; j < e.evidenceFiles.length; j++) {
          const f = e.evidenceFiles[j];
          setProgress(`Entri ${i + 1}: bukti ${j + 1}/${e.evidenceFiles.length} — ${f.name}`);
          const up = await uploadMediaFile({
            token,
            target: { collection: "stakeholder_activities", id, field: "evidencePaths" },
            file: f,
            onProgress: (p) =>
              setProgress(`Entri ${i + 1}: bukti ${j + 1}/${e.evidenceFiles.length} — ${p}%`),
          });
          paths.push(up.path);
          names.push(f.name.slice(0, 120));
        }
        if (paths.length) {
          const pres = await fetch(`/api/stakeholder-activities/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: "update", evidencePaths: paths, evidenceNames: names }),
          });
          const pdata = await pres.json().catch(() => ({}));
          if (!pres.ok) throw new Error(pdata.error || `API ${pres.status}`);
        }

        setProgress(`Entri ${i + 1}/${entries.length}: mengajukan ke Asman...`);
        const sres = await fetch(`/api/stakeholder-activities/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "submit" }),
        });
        const sdata = await sres.json().catch(() => ({}));
        if (!sres.ok) throw new Error(sdata.error || `API ${sres.status}`);
      }

      setMsg(
        `${entries.length} kegiatan terkirim ke Asman untuk direview` +
          (entries.some((e) => e.evidenceFiles.length) ? " (dengan bukti)." : ".")
      );
      setEntries([]);
    } catch (err: any) {
      // Rollback: jangan tinggalkan kegiatan setengah jadi di server.
      for (const id of created) {
        try {
          await fetch(`/api/stakeholder-activities/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          /* abaikan */
        }
      }
      setSubmitError((err?.message || String(err)) + (created.length ? " (pengiriman dibatalkan)" : ""));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

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

      {/* Kirim ke Asman */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          Kirim ke Asman
        </h2>
        <p style={{ margin: "0 0 12px 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          {entries.length} entri siap dikirim. Bukti (PDF/JPG/PNG/WebP, maks. 10 MB/file) diunggah
          langsung ke penyimpanan internal — file tidak lewat Vercel. Setelah terkirim, entri
          menunggu review Asman dan tidak bisa diubah dari halaman ini.
        </p>
        <button
          onClick={handleSubmit}
          disabled={submitting || entries.length === 0}
          style={{
            marginTop: "4px", padding: "10px 20px", borderRadius: "10px",
            border: "none", background: entries.length && !submitting ? "var(--primary)" : "var(--card-bg, #f1f5f9)",
            color: entries.length && !submitting ? "#fff" : "var(--text-muted)",
            fontWeight: 700, fontSize: "0.875rem",
            cursor: entries.length && !submitting ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Mengirim..." : `Kirim ${entries.length} entri ke Asman`}
        </button>
        {progress && (
          <div style={{ marginTop: "12px", fontSize: "0.82rem", color: "var(--text-muted)" }}>{progress}</div>
        )}
        {submitError && (
          <p style={{ margin: "12px 0 0 0", fontSize: "0.85rem", color: "var(--danger)", fontWeight: 600 }}>
            {submitError}
          </p>
        )}
        {msg && (
          <p style={{ margin: "12px 0 0 0", fontSize: "0.85rem", color: "var(--success)", fontWeight: 600 }}>
            {msg}
          </p>
        )}
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
