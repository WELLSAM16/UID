"use client";

import { useAuth } from "@/lib/authContext";
import { STAKEHOLDER_QUADRANTS } from "@/lib/stakeholder";

/**
 * Kerangka Database Stakeholder (KPI 5/6).
 * Berikutnya: tabel + form (nama, jabatan, kuadran, no HP pimpinan/PIC,
 * tgl ultah) + % kelengkapan otomatis per unit + API CRUD.
 */
export default function StakeholderDatabasePage() {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Database Stakeholder</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Unit Anda: <b>{user?.unitId || "-"}</b> • Kelompok kuadran: {STAKEHOLDER_QUADRANTS.join(" • ")}
        </p>
      </header>

      <section className="glass-panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
        <p style={{ margin: 0, fontSize: "0.95rem" }}>
          Kerangka siap — tabel stakeholder, form tambah data, dan % kelengkapan otomatis akan dibangun di tahap berikutnya.
        </p>
      </section>
    </div>
  );
}
