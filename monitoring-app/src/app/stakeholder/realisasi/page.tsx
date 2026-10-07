"use client";

import { useAuth } from "@/lib/authContext";
import { KPI_ACTIVITIES, type KpiNumber } from "@/lib/stakeholder";

/**
 * Kerangka Realisasi Kegiatan KPI 5 & 6.
 * Berikutnya: pilih bulan + input jumlah per aktivitas + upload bukti ke
 * Storage + workflow draft → pending → approved.
 */
export default function StakeholderRealisasiPage() {
  const { user } = useAuth();

  const renderKpi = (kpi: KpiNumber) => (
    <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
      <h2 style={{ margin: "0 0 4px 0", fontSize: "1.05rem", fontWeight: 700 }}>KPI {kpi}</h2>
      <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
        Unit: <b>{user?.unitId || "-"}</b>
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["KEGIATAN", "KUADRAN", "TARGET", "BOBOT", "JUMLAH", "BUKTI"].map((c) => (
              <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KPI_ACTIVITIES.filter((a) => a.kpi === kpi).map((a) => (
            <tr key={`${a.kpi}-${a.key}`} style={{ borderBottom: "1px solid var(--card-border)" }}>
              <td style={{ padding: "10px 12px", fontWeight: 600 }}>{a.label}</td>
              <td style={{ padding: "10px 12px" }}>{a.quadrant}</td>
              <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{a.targetLabel}</td>
              <td style={{ padding: "10px 12px" }}>{a.weight}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>—</td>
              <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Realisasi Kegiatan</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Input jumlah kegiatan KPI 5 & 6 per bulan beserta bukti (masuk Storage sistem, tanpa link eksternal).
        </p>
      </header>
      {renderKpi(5)}
      {renderKpi(6)}
    </div>
  );
}
