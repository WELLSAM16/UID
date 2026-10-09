"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { monthLabel } from "@/lib/pressRelease";

interface Release {
  no: number | null;
  dateText: string;
  day: number | null;
  month: number | null;
  year: number | null;
  unit: string;
  title: string;
  evidenceUrl: string;
}

interface UnitStat {
  unit: string;
  realisasi: number;
  target: number;
  selisih: number;
  percent: number;
}

interface MonthStat {
  year: number;
  month: number;
  count: number;
}

interface Anomaly {
  type: string;
  message: string;
  ref: string;
}

interface PressSource {
  id: string;
  label: string;
  targetPerUnit: number;
  validYear: number;
  isActive: boolean;
}

interface Payload {
  meta: {
    sourceId: string | null;
    label: string;
    sheetId?: string;
    gid?: string;
    targetPerUnit: number;
    validYear: number;
    isDefault?: boolean;
    fetchedAt: string;
    totalRows: number;
  };
  summary: { totalReleases: number; totalUnits: number; avgPerUnit: number; totalTarget: number; percentCapped: number };
  units: UnitStat[];
  monthly: MonthStat[];
  releases: Release[];
  anomalies: Anomaly[];
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="glass-card" style={{ padding: "20px 24px", flex: 1, minWidth: "150px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: "0.85rem", color: "#111", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "clamp(1.3rem, 6vw, 1.9rem)", fontWeight: 700, color: "#111", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

export default function PressReleaseMonitoringPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<PressSource[]>([]);
  const [sourceId, setSourceId] = useState(""); // "" = sumber aktif (otomatis)
  const [fUnit, setFUnit] = useState("Semua Unit");
  const [fMonth, setFMonth] = useState("Semua Bulan");
  const [fSearch, setFSearch] = useState("");

  const fetchWithAuth = useCallback(
    async (url: string): Promise<Response> => {
      let token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      let res = await fetch(url, { headers, cache: "no-store" });
      if (res.status === 401) {
        token = await getToken(true);
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
          res = await fetch(url, { headers, cache: "no-store" });
        }
        if (res.status === 401) router.replace("/login");
      }
      return res;
    },
    [getToken, router]
  );

  const parsePayload = async (res: Response) => {
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`API ${res.status}: body bukan JSON`);
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${json.error || "gagal"}${json.details ? " — " + json.details : ""}`);
    return json;
  };

  const load = useCallback(
    async (refresh = false, sid = sourceId) => {
      if (authLoading) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (sid) params.set("source", sid);
        if (refresh) params.set("refresh", "1");
        const qs = params.toString();
        const [srcRes, dataRes] = await Promise.all([
          fetchWithAuth("/api/press-release-sources"),
          fetchWithAuth(`/api/press-release${qs ? `?${qs}` : ""}`),
        ]);
        const srcJson = await parsePayload(srcRes);
        setSources(srcJson.sources || []);
        setData(await parsePayload(dataRes));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [authLoading, user, fetchWithAuth, router, sourceId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const exportToExcel = () => {
    if (!filtered.length) {
      alert("Tidak ada data untuk diekspor!");
      return;
    }
    const rows = filtered.map((r, i) => ({
      Nomor: i + 1,
      Tanggal: r.dateText || "-",
      Unit: r.unit,
      Judul: r.title,
      "Link Evidence": r.evidenceUrl || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Press Release");
    const safeLabel = (data?.meta.label || "press_release").replace(/[^a-zA-Z0-9]+/g, "_");
    XLSX.writeFile(wb, `Monitoring_Press_Release_${safeLabel}_${fUnit.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
  };

  const releases = data?.releases || [];
  const unitOptions = [...new Set(releases.map((r) => r.unit))].sort();

  // Basis chart + list: ikut filter unit + pencarian.
  const unitFiltered = releases.filter((r) => {
    if (fUnit !== "Semua Unit" && r.unit !== fUnit) return false;
    if (fSearch && !r.title.toLowerCase().includes(fSearch.toLowerCase())) return false;
    return true;
  });

  // Opsi bulan diturunkan dari unit terpilih agar tak ada bulan kosong.
  const monthOptions = [...new Set(
    unitFiltered.filter((r) => r.year && r.month).map((r) => `${r.year}-${r.month}`)
  )].sort();

  const filtered = unitFiltered.filter((r) => {
    if (fMonth !== "Semua Bulan" && `${r.year}-${r.month}` !== fMonth) return false;
    return true;
  });

  // Tren bulanan dihitung dari unitFiltered (ikut filter unit + pencarian,
  // abaikan filter bulan agar distribusi antar bulan tetap terlihat).
  const chartMap = new Map<string, { year: number; month: number; count: number }>();
  for (const r of unitFiltered) {
    if (!r.year || !r.month || r.month < 1 || r.month > 12) continue;
    const key = `${r.year}-${r.month}`;
    const cur = chartMap.get(key) || { year: r.year, month: r.month, count: 0 };
    cur.count += 1;
    chartMap.set(key, cur);
  }
  const chartMonthly = [...chartMap.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );

  const maxMonth = Math.max(0, ...chartMonthly.map((m) => m.count));
  const fetchedAt = data?.meta.fetchedAt
    ? new Date(data.meta.fetchedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
    : "-";

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Monitoring Press Release</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111" }}>
            Diperbarui {fetchedAt}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "0.85rem" }}>Sumber</label>
            <select
              className="input-field"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              style={{ minWidth: "200px" }}
            >
              <option value="">
                Otomatis — {sources.find((s) => s.isActive)?.label || "default"}
              </option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.isActive ? " (aktif)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={() => load(true)} style={{ background: "rgba(255,255,255,0.08)" }}>
            ↻ Muat ulang
          </button>
        </div>
      </header>

      {loading && <div className="glass-panel" style={{ padding: "24px" }}>Memuat data sheet…</div>}
      {error && <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)" }}>{error}</div>}

      {data && !loading && !error && (
        <>
          {/* Ringkasan */}
          <section className="kpi-row" style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Total Rilis" value={data.summary.totalReleases} color="#38bdf8" />
            <StatCard label="Unit Aktif" value={data.summary.totalUnits} color="#38bdf8" />
            <StatCard label="Rata-rata / Unit" value={data.summary.avgPerUnit} color="#38bdf8" />
            <StatCard label="Capaian vs Target" value={`${data.summary.percentCapped}%`} color="#38bdf8" />
          </section>

          {/* Capaian per unit */}
          <section className="glass-panel" style={{ padding: "24px", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "1.1rem", margin: "0 0 14px 0" }}>Capaian per Unit (target {data.meta.targetPerUnit}/periode, cap 120%)</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Realisasi</th>
                    <th>Target</th>
                    <th>Selisih</th>
                    <th style={{ minWidth: "220px" }}>Capaian</th>
                  </tr>
                </thead>
                <tbody>
                  {data.units.map((u) => (
                    <tr key={u.unit}>
                      <td style={{ fontWeight: 600 }}>{u.unit}</td>
                      <td>{u.realisasi}</td>
                      <td>{u.target}</td>
                      <td style={{ color: u.selisih >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                        {u.selisih >= 0 ? `+${u.selisih}` : u.selisih}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ flex: 1, height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(100, u.percent)}%`, height: "100%", background: u.percent >= 100 ? "#10b981" : "#3b82f6" }} />
                          </div>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{u.percent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Filter + tren + tabel rilis */}
          <section className="glass-panel" style={{ padding: "24px", marginBottom: "24px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "0.85rem" }}>Unit</label>
                <select
                  className="input-field"
                  value={fUnit}
                  onChange={(e) => {
                    setFUnit(e.target.value);
                    setFMonth("Semua Bulan");
                  }}
                >
                  <option value="Semua Unit">Semua Unit</option>
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "0.85rem" }}>Bulan</label>
                <select className="input-field" value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
                  <option value="Semua Bulan">Semua Bulan</option>
                  {monthOptions.map((k) => {
                    const [y, mo] = k.split("-").map(Number);
                    return <option key={k} value={k}>{monthLabel(y, mo)}</option>;
                  })}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "0.85rem" }}>Cari judul</label>
                <input className="input-field" placeholder="Ketik kata kunci…" value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
              </div>
              <button className="btn" onClick={exportToExcel} style={{ background: "#10b981", color: "#fff", fontWeight: "bold" }}>
                Download Excel
              </button>
            </div>

            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "10px" }}>
              Menampilkan {filtered.length} dari {releases.length} rilis
            </div>

            {/* Tren bulanan — mengikuti filter unit + pencarian di atas */}
            <div style={{ marginBottom: "18px", padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "12px" }}>
              <h3 style={{ fontSize: "0.95rem", margin: "0 0 12px 0" }}>
                Tren Bulanan{fUnit !== "Semua Unit" ? ` — ${fUnit}` : ""} ({unitFiltered.length} rilis)
              </h3>
              {chartMonthly.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>Tidak ada data pada filter ini.</p>
              ) : (
                <>
                <div style={{ display: "flex", gap: "24px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  {chartMonthly.map((m) => {
                    const key = `${m.year}-${m.month}`;
                    const isSel = fMonth === key;
                    return (
                      <div
                        key={key}
                        title={`${monthLabel(m.year, m.month)}: ${m.count} rilis`}
                        onClick={() => setFMonth(isSel ? "Semua Bulan" : key)}
                        style={{ textAlign: "center", minWidth: "90px", cursor: "pointer" }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: "6px", color: isSel ? "#38bdf8" : "#111" }}>{m.count}</div>
                        <div
                          style={{
                            height: `${Math.max(8, Math.round((m.count / Math.max(1, maxMonth)) * 140))}px`,
                            background: isSel ? "#38bdf8" : "#10b981",
                            borderRadius: "8px 8px 0 0",
                            minWidth: "64px",
                            outline: isSel ? "2px solid #38bdf8" : "none",
                            outlineOffset: "2px",
                          }}
                        />
                        <div style={{ fontSize: "0.78rem", color: isSel ? "#38bdf8" : "var(--text-muted)", marginTop: "6px", fontWeight: isSel ? 700 : 400 }}>
                          {monthLabel(m.year, m.month)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "10px" }}>
                  {fMonth !== "Semua Bulan"
                    ? `Menampilkan bulan: ${monthLabel(Number(fMonth.split("-")[0]), Number(fMonth.split("-")[1]))} (klik lagi untuk lepas).`
                    : "* Klik bar untuk filter bulan tersebut (klik lagi untuk lepas)."}
                </div>
                </>
              )}
            </div>

            <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Tanggal</th>
                    <th>Unit</th>
                    <th>Judul</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center" }}>Tidak ada rilis pada filter ini.</td></tr>
                  )}
                  {filtered.map((r, i) => (
                    <tr key={`${r.no}-${i}`}>
                      <td>{r.no ?? "-"}</td>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>{r.dateText || "-"}</td>
                      <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>{r.unit}</td>
                      <td style={{ fontSize: "0.85rem", maxWidth: "420px" }}>{r.title}</td>
                      <td>
                        {r.evidenceUrl ? (
                          <a href={r.evidenceUrl} target="_blank" rel="noreferrer">🔗 buka</a>
                        ) : (
                          <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>kosong</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Anomali data */}
          <section className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "1.1rem", margin: "0 0 6px 0" }}>⚠️ Anomali Data ({data.anomalies.length})</h2>
            <p style={{ fontSize: "0.8rem", margin: "0 0 14px 0" }}>
              Perbaikan dilakukan langsung di Google Sheet — web hanya monitoring.
            </p>
            {data.anomalies.length === 0 ? (
              <p style={{ fontSize: "0.9rem" }}>Tidak ada anomali. Data bersih ✅</p>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: "40vh", overflowY: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Jenis</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.anomalies.map((a, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>{a.ref}</td>
                        <td style={{ fontSize: "0.82rem" }}>{a.type}</td>
                        <td style={{ fontSize: "0.85rem" }}>{a.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
