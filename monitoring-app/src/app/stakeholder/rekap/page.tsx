"use client";

import { KPI_ACTIVITIES, capForKpi, type KpiNumber } from "@/lib/stakeholder";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/**
 * Kerangka Rekap KPI 5 & 6.
 * Berikutnya: % capaian per aktivitas per bulan (cap per KPI), sel merah bila
 * di bawah target, rata-rata berbobot, filter unit + ekspor XLSX.
 */
export default function StakeholderRekapPage() {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Rekap KPI 5 & 6</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Capaian vs target per bulan (cap KPI 5: 110%, KPI 6: 100%) • merah = target belum tercapai
        </p>
      </header>

      {([5, 6] as KpiNumber[]).map((kpi) => (
        <section key={kpi} className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px", overflowX: "auto" }}>
          <h2 style={{ margin: "0 0 12px 0", fontSize: "1.05rem", fontWeight: 700 }}>KPI {kpi} (cap {Math.round(capForKpi(kpi) * 100)}%)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", minWidth: "900px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)" }}>KEGIATAN</th>
                {MONTHS.map((m) => (
                  <th key={m} style={{ padding: "10px 8px", textAlign: "center", color: "var(--text-muted)" }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KPI_ACTIVITIES.filter((a) => a.kpi === kpi).map((a) => (
                <tr key={`${a.kpi}-${a.key}`} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {a.label} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({a.targetLabel})</span>
                  </td>
                  {MONTHS.map((m) => (
                    <td key={m} style={{ padding: "10px 8px", textAlign: "center", color: "var(--text-muted)" }}>—</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
