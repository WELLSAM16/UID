"use client";

import { useEffect } from "react";
import type { PumkMitra } from "@/lib/pumk";
import { tlProgress } from "@/lib/pumk";

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "8px", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.85rem" }}>
      <div style={{ color: "var(--text-muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function dash(v: string): string {
  const t = (v || "").trim();
  return t && t !== "#N/A" && t !== "-" ? t : "—";
}

export default function PumkDetailModal({
  mitra,
  spsUrl,
  onClose,
}: {
  mitra: PumkMitra;
  spsUrl: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prog = tlProgress(mitra);
  const progLabel = prog === "selesai" ? "Selesai" : prog === "berjalan" ? "Berjalan" : "Belum mulai";

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "24px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Detail mitra ${mitra.noId}`}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "8px" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "1.2rem", overflowWrap: "anywhere" }}>{mitra.nama || "(tanpa nama)"}</h2>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
              NO ID: <b>{mitra.noId}</b> • Kolektibilitas: <b>{mitra.kolektibilitas}</b> • Progres: <b>{progLabel}</b>
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", padding: "6px 12px" }} aria-label="Tutup detail">
            ✕
          </button>
        </div>

        <div style={{ marginTop: "12px" }}>
          <Row label="Alamat">{dash(mitra.alamat)}</Row>
          <Row label="Saldo Juli 2026">
            <b>{rp(mitra.totalJul)}</b>
            <span style={{ color: "var(--text-muted)" }}> (P {rp(mitra.pokokJul)} + J {rp(mitra.jasaJul)})</span>
          </Row>
          <Row label="PKS">{dash(mitra.pks)}</Row>
          <Row label="Tindak lanjut">{dash(mitra.tindakLanjut)}</Row>
          <Row label="Status SM I">{[mitra.status1, mitra.status2].filter((s) => s && s !== "#N/A").join(" • ") || "—"}</Row>
          <Row label="Masuk TO 2026">{dash(mitra.masukTO)}</Row>
          <Row label="Usulan TL">{dash(mitra.usulanTL)}</Row>
          <Row label="Status per Jul 2026">{dash(mitra.statusPerJuli)}</Row>
          <Row label="Status TL UP">{dash(mitra.statusTLUP)}</Row>
          <Row label="Nilai TL UP">{mitra.nilaiTLUP ? rp(mitra.nilaiTLUP) : "—"}</Row>
          <Row label="Hasil inventarisasi">{dash(mitra.hasilInventarisasi)}</Row>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "18px" }}>
          <a
            href={spsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ background: "var(--primary)", color: "white", padding: "9px 16px", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none" }}
          >
            📄 Buka SPS Online (tab UP3 Bintaro) ↗
          </a>
          {mitra.lokasiUrl && (
            <a
              href={mitra.lokasiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ background: "rgba(59,130,246,0.15)", padding: "9px 16px", fontSize: "0.85rem", textDecoration: "none" }}
            >
              📍 Maps
            </a>
          )}
          <button className="btn" onClick={onClose} style={{ padding: "9px 16px", marginLeft: "auto" }}>
            Tutup
          </button>
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "10px" }}>
          Folder evidensi per mitra ada di kolom A (“Buka Folder”) file SPS — buka SPS lalu klik Buka Folder pada baris {mitra.noId}.
        </div>
      </div>
    </div>
  );
}
