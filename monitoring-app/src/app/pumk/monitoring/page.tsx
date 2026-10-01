"use client";

import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import type { PumkMitra, PumkKpi } from "@/lib/pumk";
import { tlProgress, pumkSpsUrl } from "@/lib/pumk";
import PumkDetailModal from "@/components/PumkDetailModal";

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

function kolColor(k: string): string {
  const t = k.trim().toLowerCase();
  if (t === "macet") return "#ef4444";
  if (t === "masalah") return "#f59e0b";
  if (t === "lancar") return "#10b981";
  return "#3b82f6";
}

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass-card" style={{
      padding: "20px 24px", flex: 1, minWidth: "160px",
      position: "relative", overflow: "hidden", borderLeft: `4px solid ${color}`,
    }}>
      <div style={{
        position: "absolute", top: 0, right: 0, width: "80px", height: "80px",
        background: color, opacity: 0.15, filter: "blur(25px)",
        borderRadius: "50%", transform: "translate(30%, -30%)",
      }}></div>
      <div style={{ fontSize: "0.85rem", color: "#111", marginBottom: "8px", fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: "clamp(1.2rem, 5.5vw, 1.7rem)", fontWeight: 700, color: "#111", overflowWrap: "anywhere" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "0.78rem", color: "#111", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

export default function PumkMonitoringPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [mitra, setMitra] = useState<PumkMitra[]>([]);
  const [kpi, setKpi] = useState<PumkKpi | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [fKol, setFKol] = useState("");
  const [fTL, setFTL] = useState("");
  const [fProg, setFProg] = useState("");
  const [fTO, setFTO] = useState("");
  const [selected, setSelected] = useState<PumkMitra | null>(null);
  const [sheetId, setSheetId] = useState("");
  const [sheetGid, setSheetGid] = useState("");

  async function loadData(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      let token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      let res = await fetch(`/api/pumk${refresh ? "?refresh=1" : ""}`, { headers, cache: "no-store" });
      if (res.status === 401) {
        token = await getToken(true);
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
          res = await fetch(`/api/pumk${refresh ? "?refresh=1" : ""}`, { headers, cache: "no-store" });
        }
        if (res.status === 401) { router.replace("/login"); return; }
      }
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; }
      catch { throw new Error(`API ${res.status}: respons bukan JSON.`); }
      if (!res.ok || data.error) {
        throw new Error(`API ${res.status}: ${data.error || data.details || text.slice(0, 200)}`);
      }
      setMitra(Array.isArray(data.mitra) ? data.mitra : []);
      setKpi(data.kpi || null);
      if (data.meta?.sheetId) setSheetId(String(data.meta.sheetId));
      if (data.meta?.gid) setSheetGid(String(data.meta.gid));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setIsLoaded(true);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, getToken, router]);

  const kolOptions = useMemo(() => [...new Set(mitra.map((m) => m.kolektibilitas).filter(Boolean))].sort(), [mitra]);
  const tlOptions = useMemo(() => [...new Set(mitra.map((m) => m.tindakLanjut).filter((t) => t && t !== "-"))].sort(), [mitra]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mitra.filter((m) => {
      if (needle && !(m.noId.toLowerCase().includes(needle) || m.nama.toLowerCase().includes(needle))) return false;
      if (fKol && m.kolektibilitas !== fKol) return false;
      if (fTL && m.tindakLanjut !== fTL) return false;
      if (fProg && tlProgress(m) !== fProg) return false;
      if (fTO === "ya" && m.masukTO.toUpperCase() !== "TO 2026") return false;
      if (fTO === "tidak" && m.masukTO.toUpperCase() === "TO 2026") return false;
      return true;
    });
  }, [mitra, q, fKol, fTL, fProg, fTO]);

  const filteredRp = filtered.reduce((s, m) => s + m.totalJul, 0);
  const spsUrl = useMemo(() => pumkSpsUrl(sheetId || undefined, sheetGid || undefined), [sheetId, sheetGid]);

  const exportExcel = () => {
    if (filtered.length === 0) { alert("Tidak ada data untuk diekspor!"); return; }
    const rows = filtered.map((m, i) => ({
      No: i + 1,
      "NO ID": m.noId,
      "Nama Mitra": m.nama,
      Kolektibilitas: m.kolektibilitas,
      PKS: m.pks,
      "Saldo Pokok (Jul 2026)": m.pokokJul,
      "Saldo Jasa (Jul 2026)": m.jasaJul,
      "Total Saldo (Jul 2026)": m.totalJul,
      "Tindak Lanjut": m.tindakLanjut,
      "Status 1": m.status1,
      "Status 2": m.status2,
      "Masuk TO 2026": m.masukTO || "-",
      "Usulan TL": m.usulanTL || "-",
      Alamat: m.alamat,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PUMK Bintaro");
    XLSX.writeFile(wb, "PUMK_UP3_Bintaro.xlsx");
  };

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Monitoring PUMK</h1>
          <p style={{ margin: "5px 0 0 0", fontSize: "0.85rem", color: "#111" }}>
            Sumber: database UID
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className="btn" onClick={() => loadData(true)} disabled={loading}
            style={{ background: "#38bdf8", color: "white", padding: "8px 16px", fontSize: "0.9rem", border: "none", cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Memuat…" : "Refresh"}
          </button>
          <button className="btn" onClick={exportExcel} disabled={filtered.length === 0}
            style={{ background: "#10b981", color: "#fff", border: "none", padding: "8px 16px", fontSize: "0.9rem", fontWeight: "bold" }}>
            Export Excel
          </button>
        </div>
      </header>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 18px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", color: "var(--danger)", fontSize: "0.875rem" }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPI */}
      <section style={{ marginBottom: "28px" }}>
        <div className="kpi-row" style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <MetricBox label="Total Mitra" value={kpi ? String(kpi.totalMitra) : "…"} sub={kpi ? `${kpi.toCount} masuk TO 2026` : undefined} color="#38bdf8" />
          <MetricBox label="Total Tunggakan" value={kpi ? rp(kpi.totalTunggakan) : "…"} sub="pokok + jasa (Jul 2026)" color="#38bdf8" />
          <MetricBox
            label="Komposisi"
            value={kpi ? kpi.byKolektibilitas.map((b) => `${b.name} ${b.count}`).join(" • ") : "…"}
            sub={kpi ? kpi.byKolektibilitas.map((b) => `${b.name}: ${rp(b.rupiah)}`).join(" • ") : undefined}
            color="#38bdf8"
          />
          <MetricBox
            label="Tindak Lanjut"
            value={kpi ? `${kpi.selesai} selesai` : "…"}
            sub={kpi ? `${kpi.berjalan} berjalan • ${kpi.belumMulai} belum mulai` : undefined}
            color="#38bdf8"
          />
          <MetricBox
            label="PKS Kosong"
            value={kpi ? String(kpi.pksKosong) : "…"}
            sub="risiko hukum — segera dilengkapi"
            color="#38bdf8"
          />
        </div>
      </section>

      {/* Filter */}
      <section style={{ marginBottom: "20px" }}>
        <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Cari ID / Nama</label>
            <input className="input-field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="cth: 778/93 atau MULIA" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Kolektibilitas</label>
            <select className="input-field" value={fKol} onChange={(e) => setFKol(e.target.value)}>
              <option value="">Semua</option>
              {kolOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Tindak Lanjut</label>
            <select className="input-field" value={fTL} onChange={(e) => setFTL(e.target.value)}>
              <option value="">Semua</option>
              {tlOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Progres</label>
            <select className="input-field" value={fProg} onChange={(e) => setFProg(e.target.value)}>
              <option value="">Semua</option>
              <option value="selesai">Selesai</option>
              <option value="berjalan">Berjalan</option>
              <option value="belum">Belum mulai</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>TO 2026</label>
            <select className="input-field" value={fTO} onChange={(e) => setFTO(e.target.value)}>
              <option value="">Semua</option>
              <option value="ya">Masuk TO</option>
              <option value="tidak">Non-TO</option>
            </select>
          </div>
        </div>
      </section>

      {/* Tabel */}
      <section>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Daftar Mitra</h2>
            <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              {isLoaded && `${filtered.length} mitra • ${rp(filteredRp)}`}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {["NO ID", "NAMA MITRA", "KOLEKTIBILITAS", "SALDO (JUL 2026)", "TINDAK LANJUT", "STATUS", "TO"].map((col) => (
                    <th key={col} style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: "bold", fontSize: "0.72rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!isLoaded || loading ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Memuat data PUMK…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Tidak ada mitra pada filter ini.</td></tr>
                ) : (
                  filtered.map((m) => {
                    const prog = tlProgress(m);
                    return (
                      <tr key={m.noId} onClick={() => setSelected(m)} title="Klik untuk detail + SPS Online"
                        style={{ borderBottom: "1px solid var(--card-border)", cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(14,165,233,0.06)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", fontWeight: 600 }}>{m.noId}</td>
                        <td style={{ padding: "13px 16px", maxWidth: "260px" }}>
                          <div style={{ fontWeight: 500 }}>{m.nama}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{m.alamat}</div>
                          <div style={{ fontSize: "0.75rem", marginTop: "2px" }}>
                            {m.lokasiUrl && <a href={m.lokasiUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--primary)" }}>📍 Maps</a>}
                          </div>
                        </td>
                        <td style={{ padding: "13px 16px" }}>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, color: "white", background: kolColor(m.kolektibilitas), whiteSpace: "nowrap" }}>
                            {m.kolektibilitas}
                          </span>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>PKS: {m.pks}</div>
                        </td>
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 700, color: "var(--danger)" }}>{rp(m.totalJul)}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>P {rp(m.pokokJul)} + J {rp(m.jasaJul)}</div>
                        </td>
                        <td style={{ padding: "13px 16px", fontSize: "0.78rem", maxWidth: "220px" }}>{m.tindakLanjut}</td>
                        <td style={{ padding: "13px 16px", fontSize: "0.78rem" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap",
                            color: "white",
                            background: prog === "selesai" ? "#10b981" : prog === "berjalan" ? "#3b82f6" : "#9ca3af",
                          }}>
                            {prog === "selesai" ? "Selesai" : prog === "berjalan" ? "Berjalan" : "Belum mulai"}
                          </span>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
                            {[m.status1, m.status2].filter((s) => s && s !== "#N/A").join(" • ") || "—"}
                          </div>
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "center" }}>
                          {m.masukTO.toUpperCase() === "TO 2026" ? "✅" : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selected && (
        <PumkDetailModal mitra={selected} spsUrl={spsUrl} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
