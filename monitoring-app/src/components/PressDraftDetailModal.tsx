"use client";

import { useEffect } from "react";

export interface PressDraftDetail {
  id: string;
  title: string;
  body: string;
  mediaUrl?: string | null;
  notes?: string | null;
  what?: string | null;
  who?: string | null;
  when?: string | null;
  where?: string | null;
  why?: string | null;
  how?: string | null;
  status: string;
  authorUid?: string;
  authorEmail?: string | null;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  submittedAt?: string | null;
  slaExpiresAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  _effectiveStatus: string;
  _daysLeft: number | null;
}

function fmt(dt?: string | null) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return String(dt);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.85rem" }}>
      <div style={{ color: "var(--text-muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

export default function PressDraftDetailModal({ draft, onClose }: { draft: PressDraftDetail; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(draft.body || "");
      alert("Isi press release tersalin ke clipboard");
    } catch {
      alert("Gagal menyalin isi");
    }
  };

  const w5h1: { label: string; value?: string | null }[] = [
    { label: "What — Apa", value: draft.what },
    { label: "Who — Siapa + peran PLN", value: draft.who },
    { label: "When — Kapan", value: draft.when },
    { label: "Where — Di mana", value: draft.where },
    { label: "Why — Mengapa", value: draft.why },
    { label: "How — Bagaimana", value: draft.how },
  ];
  const hasW5h1 = w5h1.some((w) => w.value && String(w.value).trim());

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "24px", width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Detail draf ${draft.title}`}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "8px" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", overflowWrap: "anywhere" }}>{draft.title}</h2>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
              ID: {draft.id} • Status: <b style={{ textTransform: "capitalize" }}>{draft._effectiveStatus}</b>
              {draft._effectiveStatus === "pending" && draft._daysLeft !== null && (
                <> • {draft._daysLeft < 0 ? "SLA lewat" : `sisa ${draft._daysLeft} hari`}</>
              )}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", padding: "6px 12px" }} aria-label="Tutup detail">
            ✕
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 6px 0" }}>
          <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>Isi press release ({(draft.body || "").length} karakter)</div>
          <button className="btn" onClick={copyBody} style={{ padding: "5px 10px", fontSize: "0.78rem", background: "rgba(59,130,246,0.15)" }}>
            📋 Salin isi
          </button>
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            padding: "12px",
            fontSize: "0.85rem",
            lineHeight: 1.6,
            maxHeight: "320px",
            overflowY: "auto",
            margin: 0,
            fontFamily: "inherit",
          }}
        >
          {draft.body || "(kosong)"}
        </pre>

        <div style={{ marginTop: "12px" }}>
          {hasW5h1 && (
            <div style={{ marginBottom: "8px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "10px", padding: "10px 12px" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "4px" }}>5W+1H</div>
              {w5h1.filter((w) => w.value && String(w.value).trim()).map((w) => (
                <Row key={w.label} label={w.label}>{w.value}</Row>
              ))}
            </div>
          )}
          {draft.authorEmail || draft.authorUid ? (
            <Row label="Pengaju">{draft.authorEmail || draft.authorUid}</Row>
          ) : null}
          <Row label="Submit">{fmt(draft.submittedAt)}</Row>
          <Row label="Batas SLA">{fmt(draft.slaExpiresAt)}</Row>
          {draft.reviewNote ? <Row label="Catatan review">{draft.reviewNote}</Row> : null}
          {draft.reviewedBy || draft.reviewedAt ? (
            <Row label="Direview">
              {draft.reviewedBy || "-"} • {fmt(draft.reviewedAt)}
            </Row>
          ) : null}
          {draft.notes ? <Row label="Catatan">{draft.notes}</Row> : null}
          <Row label="Media">
            {draft.mediaUrl ? (
              <a href={draft.mediaUrl} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>🔗 {draft.mediaUrl}</a>
            ) : (
              "-"
            )}
          </Row>
          <Row label="Diperbarui">{fmt(draft.updatedAt)}</Row>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "8px 18px" }}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
