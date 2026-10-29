"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { isAdminRole } from "@/lib/roles";
import {
  MEDIA_PLAN_MIME,
  MEDIA_VIDEO_MAX_BYTES,
  validateMediaFile,
} from "@/lib/mediaShared";
import { fetchMediaUrl, openMediaFile, uploadMediaFile } from "@/lib/mediaClient";
import {
  POSTING_PLAN_COLLECTION,
  POSTING_PLAN_MAX_CAPTION,
  POSTING_PLAN_MAX_MEDIA,
  validatePostingPlan,
  type PostingPlan,
} from "@/lib/postingPlan";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const UPLOAD_LIMITS = {
  allowedMime: MEDIA_PLAN_MIME,
  maxBytes: MEDIA_VIDEO_MAX_BYTES,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthLabel(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  if (!y || !m) return bulan;
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

function dateLabel(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isVideo(name: string): boolean {
  return /\.(mp4|mov)$/i.test(name);
}

export default function RencanaPostinganPage() {
  const { user, getToken } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [bulan, setBulan] = useState(currentMonth());
  const [plans, setPlans] = useState<PostingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [selected, setSelected] = useState<PostingPlan | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PostingPlan | null>(null);
  const [fTanggal, setFTanggal] = useState(today());
  const [fJudul, setFJudul] = useState("");
  const [fCaption, setFCaption] = useState("");
  const [existingMedia, setExistingMedia] = useState<{ path: string; name: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function authHeaders(): Promise<HeadersInit> {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posting-plans?bulan=${encodeURIComponent(bulan)}`, {
        headers: await authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setPlans(data.plans || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bulan]);

  const byDate = useMemo(() => {
    const map = new Map<string, PostingPlan[]>();
    for (const plan of plans) {
      const key = String(plan.tanggal || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(plan);
    }
    return map;
  }, [plans]);

  const cells = useMemo(() => {
    const [y, m] = bulan.split("-").map(Number);
    if (!y || !m) return [];
    const lastDay = new Date(y, m, 0).getDate();
    const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Senin = 0
    const list: { key: string; day: number | null; tanggal: string | null }[] = [];
    for (let i = 0; i < 42; i++) {
      const day = i - firstWeekday + 1;
      const inMonth = day >= 1 && day <= lastDay;
      list.push({
        key: `${bulan}-${i}`,
        day: inMonth ? day : null,
        tanggal: inMonth ? `${bulan}-${pad(day)}` : null,
      });
    }
    return list;
  }, [bulan]);

  function openCreate(tanggal?: string) {
    setEditing(null);
    setFTanggal(tanggal || today());
    setFJudul("");
    setFCaption("");
    setExistingMedia([]);
    setFiles([]);
    setProgress(null);
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(plan: PostingPlan) {
    setEditing(plan);
    setFTanggal(plan.tanggal || today());
    setFJudul(plan.judul || "");
    setFCaption(plan.caption || "");
    const count = (plan.mediaPaths || []).length;
    setExistingMedia(
      Array.from({ length: count }, (_, i) => ({
        path: plan.mediaPaths[i],
        name: plan.mediaNames?.[i] || plan.mediaPaths[i].split("/").pop() || `media-${i + 1}`,
      }))
    );
    setFiles([]);
    setProgress(null);
    setError(null);
    setEditorOpen(true);
  }

  async function handleSave() {
    const v = validatePostingPlan({ tanggal: fTanggal, judul: fJudul, caption: fCaption });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    if (existingMedia.length + files.length > POSTING_PLAN_MAX_MEDIA) {
      setError(`Maksimal ${POSTING_PLAN_MAX_MEDIA} media per rencana.`);
      return;
    }
    for (const file of files) {
      const ferr = validateMediaFile(file, UPLOAD_LIMITS);
      if (ferr) {
        setError(`${file.name}: ${ferr}`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setMsg(null);
    setProgress(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");

      let id = editing?.id;
      if (id) {
        const res = await fetch(`/api/posting-plans/${id}`, {
          method: "PATCH",
          headers: { ...(await authHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({ tanggal: fTanggal, judul: fJudul, caption: fCaption }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      } else {
        const res = await fetch("/api/posting-plans", {
          method: "POST",
          headers: { ...(await authHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({ tanggal: fTanggal, judul: fJudul, caption: fCaption }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `API ${res.status}`);
        id = String(data.id);
      }
      if (!id) throw new Error("ID rencana tidak ditemukan.");

      const paths = existingMedia.map((m) => m.path);
      const names = existingMedia.map((m) => m.name);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Mengunggah ${i + 1}/${files.length}: ${file.name}`);
        const up = await uploadMediaFile({
          token,
          target: { collection: POSTING_PLAN_COLLECTION, id, field: "mediaPaths" },
          file,
          limits: UPLOAD_LIMITS,
          onProgress: (pct) =>
            setProgress(`Mengunggah ${i + 1}/${files.length}: ${file.name} (${pct}%)`),
        });
        paths.push(up.path);
        names.push(file.name);
      }

      const res = await fetch(`/api/posting-plans/${id}`, {
        method: "PATCH",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ mediaPaths: paths, mediaNames: names }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);

      setMsg(editing ? "Rencana diperbarui." : "Rencana postingan ditambahkan.");
      setEditorOpen(false);
      setEditing(null);
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  async function handleDelete(plan: PostingPlan) {
    if (!confirm(`Hapus rencana "${plan.judul}" tanggal ${plan.tanggal}?`)) return;
    try {
      const res = await fetch(`/api/posting-plans/${plan.id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setMsg("Rencana dihapus.");
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function openMedia(plan: PostingPlan, index: number) {
    try {
      await openMediaFile({
        token: getToken,
        target: { collection: POSTING_PLAN_COLLECTION, id: plan.id, field: "mediaPaths", index },
      });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function downloadMedia(plan: PostingPlan, index: number) {
    try {
      const token = await getToken();
      if (!token) throw new Error("Sesi login tidak ditemukan.");
      const info = await fetchMediaUrl({
        token,
        target: { collection: POSTING_PLAN_COLLECTION, id: plan.id, field: "mediaPaths", index },
      });
      const res = await fetch(info.url);
      if (!res.ok) throw new Error(`Gagal mengunduh (${res.status})`);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = info.name || "media";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function copyCaption(plan: PostingPlan) {
    try {
      await navigator.clipboard.writeText(plan.caption || "");
      setMsg("Caption disalin.");
    } catch {
      setError("Gagal menyalin caption. Salin manual dari kotak caption.");
    }
  }

  function shiftMonth(delta: number) {
    const [y, m] = bulan.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setBulan(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }

  const inputStyle = { width: "100%", boxSizing: "border-box" as const };

  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto" }}>
      <header style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "20px" }}>
        <div style={{ marginRight: "auto" }}>
          <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Peta Rencana Postingan UP</h1>
          <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Kalender konten dari UID. Semua unit dapat melihat, membuka/mengunduh media, dan menyalin caption.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => openCreate()} style={{ fontSize: "0.9rem" }}>
            + Tambah Rencana
          </button>
        )}
      </header>

      <section className="glass-panel" style={{ padding: "16px 18px", marginBottom: "18px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" onClick={() => shiftMonth(-1)} style={{ background: "white", border: "1px solid var(--card-border)" }}>‹</button>
        <input
          className="input-field"
          type="month"
          value={bulan}
          onChange={(e) => setBulan(e.target.value || currentMonth())}
          style={{ width: "170px" }}
        />
        <button className="btn" onClick={() => shiftMonth(1)} style={{ background: "white", border: "1px solid var(--card-border)" }}>›</button>
        <b style={{ fontSize: "1.05rem", marginLeft: "8px", textTransform: "capitalize" }}>{monthLabel(bulan)}</b>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "auto" }}>
          {loading ? "Memuat..." : `${plans.length} rencana`}
        </span>
        <button className="btn" onClick={load} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
          Muat ulang
        </button>
      </section>

      {msg && (
        <div style={{ marginBottom: "14px", padding: "10px 16px", borderRadius: "10px", fontSize: "0.85rem", background: "rgba(16, 185, 129, 0.12)", color: "var(--success)", border: "1px solid var(--card-border)" }}>
          {msg}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: "14px", padding: "10px 16px", borderRadius: "10px", fontSize: "0.85rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid var(--card-border)" }}>
          {error}
        </div>
      )}

      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "780px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: "rgba(0,0,0,0.03)", borderBottom: "1px solid var(--card-border)" }}>
              {WEEKDAYS.map((d) => (
                <div key={d} style={{ padding: "10px", textAlign: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                  {d.toUpperCase()}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {cells.map((cell) => {
                const dayPlans = cell.tanggal ? byDate.get(cell.tanggal) || [] : [];
                return (
                  <div
                    key={cell.key}
                    style={{
                      minHeight: "118px",
                      borderRight: "1px solid var(--card-border)",
                      borderBottom: "1px solid var(--card-border)",
                      padding: "6px",
                      background: cell.tanggal ? "transparent" : "rgba(0,0,0,0.02)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: cell.tanggal ? "var(--text-main)" : "var(--text-muted)" }}>
                        {cell.day ?? ""}
                      </span>
                      {isAdmin && cell.tanggal && (
                        <button
                          onClick={() => openCreate(cell.tanggal!)}
                          title="Tambah rencana di tanggal ini"
                          style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--primary)", fontSize: "0.9rem", lineHeight: 1 }}
                        >
                          +
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px", overflowY: "auto", maxHeight: "88px" }}>
                      {dayPlans.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => setSelected(plan)}
                          title={plan.judul}
                          style={{
                            textAlign: "left",
                            border: "1px solid rgba(59, 130, 246, 0.35)",
                            background: "rgba(59, 130, 246, 0.10)",
                            color: "var(--text-main)",
                            borderRadius: "6px",
                            padding: "4px 6px",
                            fontSize: "0.7rem",
                            cursor: "pointer",
                            lineHeight: 1.25,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {plan.mediaPaths?.length ? "🎞️ " : "📝 "}
                          {plan.judul}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {!loading && plans.length === 0 && (
        <p style={{ marginTop: "14px", fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
          Belum ada rencana postingan untuk {monthLabel(bulan)}.
        </p>
      )}

      {selected && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "620px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ marginRight: "auto" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "capitalize" }}>{dateLabel(selected.tanggal)}</div>
                <h3 style={{ margin: "4px 0 0", fontSize: "1.15rem" }}>{selected.judul}</h3>
              </div>
              <button className="btn" onClick={() => setSelected(null)} style={{ background: "white", border: "1px solid var(--card-border)" }}>✕</button>
            </div>

            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "8px" }}>Media ({selected.mediaPaths?.length || 0})</div>
              {(selected.mediaPaths?.length || 0) === 0 ? (
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>Belum ada media.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {selected.mediaPaths.map((path, i) => {
                    const name = selected.mediaNames?.[i] || path.split("/").pop() || `media-${i + 1}`;
                    return (
                      <div key={`${path}-${i}`} style={{ display: "flex", gap: "8px", alignItems: "center", border: "1px solid var(--card-border)", borderRadius: "10px", padding: "8px 10px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.82rem", marginRight: "auto", wordBreak: "break-all" }}>
                          {isVideo(name) ? "🎬" : "🖼️"} {name}
                        </span>
                        <button className="btn" onClick={() => openMedia(selected, i)} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.78rem", padding: "5px 10px" }}>
                          Buka
                        </button>
                        <button className="btn" onClick={() => downloadMedia(selected, i)} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.78rem", padding: "5px 10px" }}>
                          Unduh
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>Caption</div>
                <button
                  className="btn"
                  onClick={() => copyCaption(selected)}
                  disabled={!selected.caption}
                  style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.75rem", padding: "4px 10px", marginLeft: "auto" }}
                >
                  Salin caption
                </button>
              </div>
              <pre style={{ margin: 0, padding: "12px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "rgba(0,0,0,0.02)", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: "0.84rem", maxHeight: "240px", overflowY: "auto" }}>
                {selected.caption || "—"}
              </pre>
            </div>

            {isAdmin && (
              <div style={{ marginTop: "18px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => handleDelete(selected)} style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid var(--card-border)" }}>
                  Hapus
                </button>
                <button className="btn btn-primary" onClick={() => openEdit(selected)}>Edit</button>
              </div>
            )}
          </div>
        </div>
      )}

      {editorOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: "16px" }}
          onClick={() => { if (!saving) setEditorOpen(false); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "660px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{editing ? "Edit Rencana" : "Tambah Rencana"}</h3>
            <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Media maksimal {POSTING_PLAN_MAX_MEDIA} file; gambar JPG/PNG/WebP atau video MP4/MOV maks {Math.round(MEDIA_VIDEO_MAX_BYTES / 1024 / 1024)} MB per file.
            </p>

            <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Tanggal</label>
                  <input className="input-field" type="date" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Judul konten</label>
                  <input className="input-field" value={fJudul} maxLength={200} onChange={(e) => setFJudul(e.target.value)} placeholder="cth: Clean Energy Day" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Caption (boleh disalin unit)</label>
                <textarea
                  className="input-field"
                  value={fCaption}
                  maxLength={POSTING_PLAN_MAX_CAPTION}
                  onChange={(e) => setFCaption(e.target.value)}
                  rows={7}
                  placeholder="Tulis caption lengkap + hashtag…"
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                  Media ({existingMedia.length + files.length}/{POSTING_PLAN_MAX_MEDIA})
                </label>
                {existingMedia.map((m, i) => (
                  <div key={`${m.path}-${i}`} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px dashed var(--card-border)", fontSize: "0.82rem" }}>
                    <span style={{ marginRight: "auto", wordBreak: "break-all" }}>{isVideo(m.name) ? "🎬" : "🖼️"} {m.name}</span>
                    <button
                      onClick={() => setExistingMedia((list) => list.filter((_, idx) => idx !== i))}
                      disabled={saving}
                      style={{ border: 0, background: "transparent", color: "var(--danger)", cursor: "pointer", fontSize: "0.78rem" }}
                    >
                      Hapus
                    </button>
                  </div>
                ))}
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px dashed var(--card-border)", fontSize: "0.82rem" }}>
                    <span style={{ marginRight: "auto", wordBreak: "break-all" }}>{f.type.startsWith("video/") ? "🎬" : "🖼️"} {f.name} <span style={{ color: "var(--text-muted)" }}>({(f.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                    <button
                      onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                      disabled={saving}
                      style={{ border: 0, background: "transparent", color: "var(--danger)", cursor: "pointer", fontSize: "0.78rem" }}
                    >
                      Batal
                    </button>
                  </div>
                ))}
                <input
                  className="input-field"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                  disabled={saving || existingMedia.length + files.length >= POSTING_PLAN_MAX_MEDIA}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    e.target.value = "";
                    if (!picked.length) return;
                    const room = POSTING_PLAN_MAX_MEDIA - existingMedia.length - files.length;
                    if (picked.length > room) setError(`Maksimal ${POSTING_PLAN_MAX_MEDIA} media per rencana.`);
                    setFiles((prev) => [...prev, ...picked.slice(0, Math.max(0, room))]);
                  }}
                  style={{ ...inputStyle, marginTop: "8px" }}
                />
              </div>
            </div>

            {progress && <div style={{ marginTop: "12px", fontSize: "0.82rem", color: "var(--text-muted)" }}>{progress}</div>}

            <div style={{ marginTop: "18px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEditorOpen(false)} disabled={saving}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
