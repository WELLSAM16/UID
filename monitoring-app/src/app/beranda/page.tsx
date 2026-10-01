"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { Card, DonutChart, LineChart } from "@/components/Charts";

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

function kolColor(k: string): string {
  const t = (k || "").trim().toLowerCase();
  if (t === "macet") return "#ef4444";
  if (t === "masalah") return "#3b82f6";
  if (t === "lancar") return "#10b981";
  return "#3b82f6";
}

const SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const LONG_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card" style={{ padding: "20px 24px", flex: 1, minWidth: "160px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: "0.85rem", color: "#111", marginBottom: "8px", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "clamp(1.15rem, 5.5vw, 1.7rem)", fontWeight: 700, color, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

export default function BerandaPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [igMonthly, setIgMonthly] = useState<{ label: string; short: string; value: number }[]>([]);
  const [pressTotal, setPressTotal] = useState<number | null>(null);
  const [pressBintaro, setPressBintaro] = useState<{ unit: string; realisasi: number; target: number; percent: number } | null>(null);
  const [pumkKpi, setPumkKpi] = useState<{ totalMitra: number; totalTunggakan: number; byKolektibilitas: { name: string; count: number; rupiah: number }[] } | null>(null);
  const [targetProgress, setTargetProgress] = useState<{
    target: { startDate: string; endDate: string; targetScore: number; targetPosts: number };
    totalScore: number;
    totalPosts: number;
    corpPosts: number;
    corpScore: number;
    infPosts: number;
    infScore: number;
    daysLeft: number;
  } | null>(null);
  const [noRunningTarget, setNoRunningTarget] = useState(false);

  async function fetchJson(path: string, token: string | null) {
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(path, { headers, cache: "no-store" });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`API ${res.status}: respons bukan JSON.`); }
    if (!res.ok || data.error) throw new Error(`API ${res.status}: ${data.error || data.details || text.slice(0, 200)}`);
    return data;
  }

  async function loadData() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [pumk, press, skoring, targetData] = await Promise.all([
        fetchJson("/api/pumk", token),
        fetchJson("/api/press-release", token),
        fetchJson("/api/skoring", token),
        fetchJson("/api/targets", token).catch(() => ({ targets: [] })),
      ]);
      setPumkKpi(pumk.kpi || null);
      setPressTotal(typeof press.summary?.totalReleases === "number" ? press.summary.totalReleases : (Array.isArray(press.releases) ? press.releases.length : 0));
      const bintaroUnit = Array.isArray(press.units)
        ? press.units.find((u: any) => String(u.unit || "").toLowerCase().includes("bintaro"))
        : null;
      setPressBintaro(bintaroUnit ? {
        unit: String(bintaroUnit.unit),
        realisasi: Number(bintaroUnit.realisasi) || 0,
        target: Number(bintaroUnit.target) || 12,
        percent: Number(bintaroUnit.percent) || 0,
      } : null);
      const posts: any[] = Array.isArray(skoring.posts) ? skoring.posts : [];
      // Tren bulanan 12 bulan terakhir dari timestamp postingan.
      const byMonth = new Map<string, number>();
      let maxKey = "";
      for (const p of posts) {
        const d = new Date(p.timestamp);
        if (isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) || 0) + 1);
        if (key > maxKey) maxKey = key;
      }
      const trend: { label: string; short: string; value: number }[] = [];
      if (maxKey) {
        const [ey, em] = maxKey.split("-").map(Number);
        for (let k = 11; k >= 0; k--) {
          const dt = new Date(ey, em - 1 - k, 1);
          const y = dt.getFullYear(), m = dt.getMonth() + 1;
          const key = `${y}-${String(m).padStart(2, "0")}`;
          trend.push({ label: `${LONG_ID[m - 1]} ${y}`, short: `${SHORT_ID[m - 1]} ${String(y).slice(2)}`, value: byMonth.get(key) || 0 });
        }
      }
      setIgMonthly(trend);
      // Progress target berjalan: hanya target Active yang mencakup hari ini.
      try {
        const allTargets: any[] = Array.isArray(targetData.targets) ? targetData.targets : [];
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const running = allTargets
          .filter((t) => t.status === "Active" && t.startDate && t.endDate && t.startDate <= todayStr && todayStr <= t.endDate)
          .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
        if (running.length === 0) {
          setTargetProgress(null);
          setNoRunningTarget(true);
        } else {
          const t = running[0];
          const start = new Date(t.startDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(t.endDate);
          end.setHours(23, 59, 59, 999);
          let totalScore = 0, totalPosts = 0, corpPosts = 0, corpScore = 0, infPosts = 0, infScore = 0;
          for (const p of posts) {
            const d = p.timestamp ? new Date(p.timestamp) : null;
            if (!d || isNaN(d.getTime())) continue;
            if (d < start || d > end) continue;
            const s = Number(p.scoring?.score) || 0;
            totalScore += s;
            totalPosts += 1;
            const uname = String(p.username || "").toLowerCase();
            const src = String(p.source_account || "").toLowerCase();
            const isCorp = uname === "plnbintaro" || src === "plnbintaro" || src === "akun_pertama";
            if (isCorp) { corpPosts += 1; corpScore += s; }
            else { infPosts += 1; infScore += s; }
          }
          const endMid = new Date(t.endDate);
          endMid.setHours(0, 0, 0, 0);
          const todayMid = new Date();
          todayMid.setHours(0, 0, 0, 0);
          const daysLeft = Math.max(0, Math.ceil((endMid.getTime() - todayMid.getTime()) / 86400000));
          setTargetProgress({
            target: { startDate: t.startDate, endDate: t.endDate, targetScore: Number(t.targetScore) || 0, targetPosts: Number(t.targetPosts) || 0 },
            totalScore, totalPosts, corpPosts, corpScore, infPosts, infScore, daysLeft,
          });
          setNoRunningTarget(false);
        }
      } catch {
        setTargetProgress(null);
        setNoRunningTarget(false);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const donutData = useMemo(
    () => (pumkKpi ? pumkKpi.byKolektibilitas.map((b) => ({ label: b.name, value: b.count, color: kolColor(b.name) })) : []),
    [pumkKpi]
  );

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Beranda</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111", overflowWrap: "anywhere" }}>
            Halo, {user?.email || "pengguna"}
          </p>
        </div>
        <button className="btn" onClick={loadData} disabled={loading || !user}
          style={{ background: "#38bdf8", color: "white", padding: "8px 16px", fontSize: "0.9rem", border: "none", cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Memuat…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 18px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", color: "var(--danger)", fontSize: "0.875rem" }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPI */}
      <section style={{ marginBottom: "24px" }}>
        <div className="kpi-row" style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Kpi label="Tunggakan PUMK" value={pumkKpi ? rp(pumkKpi.totalTunggakan) : "…"} color="var(--danger)" />
          <Kpi label="Mitra PUMK" value={pumkKpi ? String(pumkKpi.totalMitra) : "…"} color="#10b981" />
        </div>
      </section>

      {/* Charts */}
      <section style={{ marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
          <Card title="Press Release Bintaro" sub="Realisasi unit Bintaro vs target">
            {loading && !pressBintaro && pressTotal === null ? (
              "Memuat…"
            ) : !pressBintaro ? (
              <div style={{ fontSize: "0.85rem", color: "#111" }}>
                Unit Bintaro tidak ditemukan di sumber aktif.
                {pressTotal !== null && <div style={{ marginTop: "8px", fontWeight: 700 }}>Total semua unit: {pressTotal} rilis</div>}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "0.85rem", color: "#111" }}>
                  <span>{pressBintaro.unit}: {pressBintaro.realisasi} / {pressBintaro.target}</span>
                  <span style={{ fontWeight: 700 }}>{pressBintaro.percent}%</span>
                </div>
                <div style={{ width: "100%", height: "12px", background: "rgba(0,0,0,0.08)", borderRadius: "6px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pressBintaro.percent, 100)}%`, height: "100%", background: pressBintaro.percent >= 100 ? "#10b981" : "#38bdf8", transition: "width 0.5s ease" }} />
                </div>
                {pressTotal !== null && (
                  <div style={{ marginTop: "12px", fontSize: "0.85rem", color: "#111" }}>
                    Total semua unit: <strong>{pressTotal} rilis</strong>
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card title="Komposisi Kolektibilitas PUMK" sub="Jumlah mitra per status">
            {loading && donutData.length === 0 ? "Memuat…" : <DonutChart data={donutData} />}
          </Card>
        </div>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <Card title="Tren Postingan IG per Bulan" sub="12 bulan terakhir (arsip)">
          {loading && igMonthly.length === 0 ? "Memuat…" : <LineChart data={igMonthly} />}
        </Card>
      </section>

      {/* Progress Target Medsos Berjalan */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "14px", color: "#111" }}>Progress Target Medsos</h2>
        <div className="glass-panel" style={{ padding: "22px" }}>
          {loading && !targetProgress && !noRunningTarget ? (
            <div style={{ color: "#111" }}>Memuat target…</div>
          ) : noRunningTarget || !targetProgress ? (
            <div style={{ color: "#111", fontSize: "0.9rem" }}>
              Tidak ada target berjalan hari ini — hubungi admin untuk mengatur target di halaman Kelola Target.
            </div>
          ) : (
            (() => {
              const tp = targetProgress;
              const scorePct = tp.target.targetScore > 0 ? Math.min(Math.round((tp.totalScore / tp.target.targetScore) * 100), 120) : 0;
              const postPct = tp.target.targetPosts > 0 ? Math.min(Math.round((tp.totalPosts / tp.target.targetPosts) * 100), 120) : 0;
              const sisaScore = Math.max(0, tp.target.targetScore - tp.totalScore);
              const sisaPosts = Math.max(0, tp.target.targetPosts - tp.totalPosts);
              const needScore = tp.daysLeft > 0 ? sisaScore / tp.daysLeft : sisaScore;
              const needPosts = tp.daysLeft > 0 ? sisaPosts / tp.daysLeft : sisaPosts;
              const corpShare = tp.totalScore > 0 ? Math.round((tp.corpScore / tp.totalScore) * 100) : 0;
              const infShare = tp.totalScore > 0 ? Math.round((tp.infScore / tp.totalScore) * 100) : 0;
              const bar = (pct: number) => (
                <div style={{ width: "100%", height: "10px", background: "rgba(0,0,0,0.08)", borderRadius: "5px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: pct >= 100 ? "#10b981" : "#3b82f6", transition: "width 0.5s ease" }} />
                </div>
              );
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
                    <div style={{ fontWeight: 700, color: "#111" }}>
                      Periode {tp.target.startDate} s/d {tp.target.endDate}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#111", background: "rgba(56,189,248,0.15)", padding: "4px 10px", borderRadius: "12px" }}>
                      Sisa {tp.daysLeft} hari
                    </div>
                  </div>
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "0.9rem", color: "#111" }}>
                      <span>Skor: {tp.totalScore.toLocaleString("id-ID")} / {tp.target.targetScore.toLocaleString("id-ID")}</span>
                      <span style={{ fontWeight: 700 }}>{scorePct}%</span>
                    </div>
                    {bar(scorePct)}
                  </div>
                  <div style={{ marginBottom: "18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "0.9rem", color: "#111" }}>
                      <span>Postingan: {tp.totalPosts.toLocaleString("id-ID")} / {tp.target.targetPosts.toLocaleString("id-ID")}</span>
                      <span style={{ fontWeight: 700 }}>{postPct}%</span>
                    </div>
                    {bar(postPct)}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                    <div style={{ border: "1px solid var(--card-border)", borderRadius: "10px", padding: "14px" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#111", marginBottom: "6px" }}>Korporat (@plnbintaro)</div>
                      <div style={{ fontSize: "0.85rem", color: "#111" }}>{tp.corpPosts.toLocaleString("id-ID")} postingan • {tp.corpScore.toLocaleString("id-ID")} skor</div>
                      <div style={{ fontSize: "0.8rem", color: "#111", marginTop: "4px" }}>Kontribusi skor: {corpShare}%</div>
                    </div>
                    <div style={{ border: "1px solid var(--card-border)", borderRadius: "10px", padding: "14px" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#111", marginBottom: "6px" }}>Influencer (6 akun)</div>
                      <div style={{ fontSize: "0.85rem", color: "#111" }}>{tp.infPosts.toLocaleString("id-ID")} postingan • {tp.infScore.toLocaleString("id-ID")} skor</div>
                      <div style={{ fontSize: "0.8rem", color: "#111", marginTop: "4px" }}>Kontribusi skor: {infShare}%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    <div style={{ fontSize: "0.85rem", color: "#111" }}>
                      Butuh {needScore.toLocaleString("id-ID", { maximumFractionDigits: 1 })} skor/hari • {needPosts.toLocaleString("id-ID", { maximumFractionDigits: 1 })} postingan/hari untuk tercapai.
                    </div>
                    <a href={`/dashboard/skoring?startDate=${tp.target.startDate}&endDate=${tp.target.endDate}`} style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: 600 }}>
                      Lihat detail di Skoring →
                    </a>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </section>

      {/* Alur kerja draf */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "14px", color: "#111" }}>Alur kerja draf</h2>
        <div className="glass-panel" style={{ padding: "22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {[
              { step: "1", title: "Buat draf", desc: "User isi judul, caption + link Drive" },
              { step: "2", title: "Submit", desc: "Draf masuk antrian admin (SLA 7 hari)" },
              { step: "3", title: "Review", desc: "Admin approve / reject + catatan" },
              { step: "4", title: "Publish", desc: "Draf approved dipublish & tersimpan 90 hari" },
            ].map((w) => (
              <div key={w.step} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div
                  style={{
                    minWidth: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "#38bdf8",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                  }}
                >
                  {w.step}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#111" }}>{w.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "#111" }}>{w.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.8rem", marginTop: "16px", marginBottom: 0, color: "#111" }}>
            * Draf pending yang tak direview dalam 7 hari otomatis expired (terkunci, bisa diduplikat).
            Data approved/rejected/published/expired tersimpan 90 hari.
          </p>
        </div>
      </section>
    </div>
  );
}
