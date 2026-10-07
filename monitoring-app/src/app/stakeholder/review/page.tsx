"use client";

import { useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/authContext";
import {
  ACTIVITY_STATUS_LABELS,
  allowedTransitions,
  kpi6Activities,
  type ActivityStatus,
  type StakeholderActivity,
} from "@/lib/stakeholder";

interface MockEntry extends StakeholderActivity {
  bukti: number; // jumlah file bukti (mock)
}

/** Contoh antrean se-unit Asman (data mock — API menyusul). */
const MOCK: MockEntry[] = [
  {
    id: "m1",
    unitId: "UP3 BINTARO",
    kpi: 6,
    activityKey: "audiensi",
    quadrant: "Keep Satisfied",
    tanggal: "2026-09-04",
    judul: "Pertemuan informal penyampaian informasi pasang baru dapur MBG",
    keteranganKepentingan:
      "Stakeholder membutuhkan keandalan listrik; pengaruh tinggi di lingkungan, kepentingan rendah pada kebijakan strategis PLN.",
    bulan: 9,
    tahun: 2026,
    jumlah: 1,
    bukti: 1,
    status: "pending_asman",
    authorUid: "tl-bintaro",
  },
  {
    id: "m2",
    unitId: "UP3 BINTARO",
    kpi: 6,
    activityKey: "share_wag",
    quadrant: "Monitor",
    tanggal: "2026-09-03",
    judul: "Share info layanan Hari Pelanggan Nasional di WAG Sinergi Parung Serab",
    keteranganKepentingan:
      "WAG kelurahan; pengaruh rendah, kebutuhan sebatas info layanan.",
    bulan: 9,
    tahun: 2026,
    jumlah: 1,
    bukti: 1,
    status: "pending_asman",
    authorUid: "tl-bintaro",
  },
  {
    id: "m3",
    unitId: "UP3 BINTARO",
    kpi: 6,
    activityKey: "sapa_personal",
    quadrant: "Keep Satisfied",
    tanggal: "2026-09-03",
    judul: "Sapa personal rencana audiensi Kabar Bintaro",
    keteranganKepentingan: "Media berpengaruh ke opini warga.",
    bulan: 9,
    tahun: 2026,
    jumlah: 1,
    bukti: 1,
    status: "revisi_tl",
    asmanNote: "Tambahkan tingkat pengaruh dan kepentingan pada keterangan.",
    authorUid: "tl-bintaro",
  },
];

/**
 * Kerangka antrean review Asman (KPI 6).
 * ACC → acc_asman (TL yang meneruskan ke Admin UID);
 * tolak wajib catatan → revisi_tl (TL perbaiki).
 * Data mock lokal — API + Firestore menyusul.
 */
export default function StakeholderReviewPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<MockEntry[]>(MOCK);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);

  const activities = useMemo(() => kpi6Activities(), []);
  const labelFor = (key: string) =>
    activities.find((a) => a.key === key)?.label ?? key;

  const queue = entries.filter((e) => e.status === "pending_asman");
  const done = entries.filter((e) => e.status !== "pending_asman");

  const move = (id: string, to: ActivityStatus, note?: string) => {
    if (!allowedTransitions("pending_asman", "asman").includes(to)) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: to, ...(to === "revisi_tl" ? { asmanNote: note || "" } : {}) }
          : e
      )
    );
    setRejecting(null);
  };

  return (
    <ProtectedRoute allowedRoles={["asman"]}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <header style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>
            Review Asman — KPI 6
          </h1>
          <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Unit: <b>{user?.unitId || "-"}</b> • {queue.length} menunggu review
          </p>
        </header>

        {queue.length === 0 && (
          <section className="glass-panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
            Antrean kosong — tidak ada kiriman TL yang menunggu.
          </section>
        )}

        {queue.map((e) => (
          <section key={e.id} className="glass-panel" style={{ padding: "20px 24px", marginBottom: "16px" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{e.judul}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 8px 0" }}>
              {labelFor(e.activityKey)} • {e.quadrant} • {e.tanggal} • {e.bukti} bukti
            </div>
            <p style={{ fontSize: "0.85rem", margin: "0 0 12px 0" }}>{e.keteranganKepentingan}</p>
            {rejecting === e.id ? (
              <div>
                <textarea
                  value={notes[e.id] ?? ""}
                  onChange={(ev) => setNotes((p) => ({ ...p, [e.id]: ev.target.value }))}
                  rows={2}
                  placeholder="Catatan revisi untuk TL (wajib)"
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
                    Kirim revisi
                  </button>
                  <button
                    onClick={() => setRejecting(null)}
                    style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "transparent", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => move(e.id, "acc_asman")}
                  style={{ padding: "8px 16px", borderRadius: "10px", border: "none", background: "var(--success)", color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                >
                  ACC — teruskan ke TL
                </button>
                <button
                  onClick={() => setRejecting(e.id)}
                  style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "transparent", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                >
                  Tolak + catatan
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
                <b>{e.judul}</b> — {ACTIVITY_STATUS_LABELS[e.status]}
                {e.status === "revisi_tl" && e.asmanNote && (
                  <span style={{ color: "var(--text-muted)" }}> • “{e.asmanNote}”</span>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </ProtectedRoute>
  );
}
