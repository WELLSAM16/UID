"use client";

import { useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { UNIT_OPTIONS } from "@/lib/roles";
import {
  ACTIVITY_STATUS_LABELS,
  allowedTransitions,
  kpi6Activities,
  type ActivityStatus,
  type StakeholderActivity,
} from "@/lib/stakeholder";

interface MockEntry extends StakeholderActivity {
  bukti: number;
}

/** Contoh antrean lintas unit (data mock — API menyusul). */
const MOCK: MockEntry[] = [
  {
    id: "e1",
    unitId: "UP3 BINTARO",
    kpi: 6,
    activityKey: "audiensi",
    quadrant: "Keep Satisfied",
    tanggal: "2026-09-04",
    judul: "Pertemuan informal pelanggan SPKLU komunitas BYD Atto Tangsel",
    keteranganKepentingan:
      "Komunitas EV; pengaruh sedang, kepentingan rendah pada kebijakan strategis.",
    bulan: 9,
    tahun: 2026,
    jumlah: 1,
    bukti: 1,
    status: "pending_admin",
    asmanNote: null,
    authorUid: "tl-bintaro",
  },
  {
    id: "e2",
    unitId: "UP3 CIPUTAT",
    kpi: 6,
    activityKey: "share_wag",
    quadrant: "Monitor",
    tanggal: "2026-09-02",
    judul: "Share info promo tambah daya di WAG sinergi kecamatan",
    keteranganKepentingan: "WAG warga; pengaruh rendah, kebutuhan info layanan.",
    bulan: 9,
    tahun: 2026,
    jumlah: 1,
    bukti: 3,
    status: "pending_admin",
    asmanNote: null,
    authorUid: "tl-ciputat",
  },
];

/**
 * Kerangka evaluasi final Admin UID (KPI 6, lintas unit).
 * Lolos → approved (masuk rekap); catatan → revisi_tl (TL perbaiki).
 * Data mock lokal — API + Firestore menyusul.
 */
export default function StakeholderEvaluasiPage() {
  const [entries, setEntries] = useState<MockEntry[]>(MOCK);
  const [unitFilter, setUnitFilter] = useState<string>("SEMUA");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noting, setNoting] = useState<string | null>(null);

  const activities = useMemo(() => kpi6Activities(), []);
  const labelFor = (key: string) =>
    activities.find((a) => a.key === key)?.label ?? key;

  const queue = entries.filter(
    (e) =>
      e.status === "pending_admin" &&
      (unitFilter === "SEMUA" || e.unitId === unitFilter)
  );
  const done = entries.filter((e) => e.status !== "pending_admin");

  const move = (id: string, to: ActivityStatus, note?: string) => {
    if (!allowedTransitions("pending_admin", "admin_uid").includes(to)) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: to, ...(to === "revisi_tl" ? { adminNote: note || "" } : {}) }
          : e
      )
    );
    setNoting(null);
  };

  return (
    <ProtectedRoute allowedRoles={["admin_uid"]}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <header style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>
            Evaluasi Final — KPI 6
          </h1>
          <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Lintas unit • {queue.length} menunggu evaluasi
          </p>
        </header>

        <section className="glass-panel" style={{ padding: "16px 24px", marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px" }}>
            FILTER UNIT
          </label>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            style={{ width: "100%", maxWidth: "320px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--card-border)", fontSize: "0.875rem" }}
          >
            <option value="SEMUA">Semua unit</option>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </section>

        {queue.length === 0 && (
          <section className="glass-panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
            Antrean kosong untuk filter ini.
          </section>
        )}

        {queue.map((e) => (
          <section key={e.id} className="glass-panel" style={{ padding: "20px 24px", marginBottom: "16px" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)" }}>{e.unitId}</div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", marginTop: "4px" }}>{e.judul}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 8px 0" }}>
              {labelFor(e.activityKey)} • {e.quadrant} • {e.tanggal} • {e.bukti} bukti
            </div>
            <p style={{ fontSize: "0.85rem", margin: "0 0 12px 0" }}>{e.keteranganKepentingan}</p>
            {noting === e.id ? (
              <div>
                <textarea
                  value={notes[e.id] ?? ""}
                  onChange={(ev) => setNotes((p) => ({ ...p, [e.id]: ev.target.value }))}
                  rows={2}
                  placeholder="Catatan perbaikan untuk TL (wajib)"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--card-border)", fontSize: "0.85rem", boxSizing: "border-box", marginBottom: "8px" }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      const note = (notes[e.id] ?? "").trim();
                      if (note.length < 10) return;
                      move(e.id, "revisi_tl", note);
                    }}
                    style={{ padding: "8px 16px", borderRadius: "10px", border: "none", background: "var(--danger)", color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                  >
                    Kirim catatan
                  </button>
                  <button
                    onClick={() => setNoting(null)}
                    style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "transparent", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => move(e.id, "approved")}
                  style={{ padding: "8px 16px", borderRadius: "10px", border: "none", background: "var(--success)", color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                >
                  Lolos final
                </button>
                <button
                  onClick={() => setNoting(e.id)}
                  style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "transparent", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                >
                  Beri catatan
                </button>
              </div>
            )}
          </section>
        ))}

        {done.length > 0 && (
          <section className="glass-panel" style={{ padding: "20px 24px", marginTop: "24px" }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "1rem", fontWeight: 700 }}>
              Riwayat putusan sesi ini ({done.length})
            </h2>
            {done.map((e) => (
              <div key={e.id} style={{ fontSize: "0.85rem", padding: "8px 0", borderBottom: "1px solid var(--card-border)" }}>
                <b>{e.unitId}</b> — {e.judul} — {ACTIVITY_STATUS_LABELS[e.status]}
                {e.status === "revisi_tl" && e.adminNote && (
                  <span style={{ color: "var(--text-muted)" }}> • “{e.adminNote}”</span>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </ProtectedRoute>
  );
}
