"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { isAdminRole } from "@/lib/roles";
import { useRouter } from "next/navigation";

interface Post {
  id: string;
  caption: string;
  media_type: string;
  permalink: string;
  timestamp: string;
  username: string;
  source_account: string;
  scoring?: { score: number };
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  plays: number;
  views?: number;
}

function formatDate(ts: string) {
  if (!ts) return "-";
  const date = new Date(ts);
  return date.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getFormatLabel(mediaType: string) {
  switch (mediaType) {
    case "VIDEO": return { label: "Reels", color: "#9333ea" };
    case "CAROUSEL_ALBUM": return { label: "Carousel", color: "#0ea5e9" };
    default: return { label: "Image", color: "#10b981" };
  }
}

function monthKey(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function calcER(post: Post): string {
  const total = post.likes + post.comments + post.shares + post.saved;
  const base = post.reach || 1;
  return ((total / base) * 100).toFixed(1) + "%";
}

function FormatBadge({ mediaType }: { mediaType: string }) {
  const { label, color } = getFormatLabel(mediaType);
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      color: "white",
      background: color,
      letterSpacing: "0.03em",
    }}>
      {label}
    </span>
  );
}

function MetricBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="glass-card kpi-card" style={{
      padding: "18px 20px",
      width: "100%",
      minWidth: 0,
      position: "relative",
      overflow: "hidden",
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{
        position: "absolute",
        top: 0, right: 0,
        width: "80px", height: "80px",
        background: color,
        opacity: 0.15,
        filter: "blur(25px)",
        borderRadius: "50%",
        transform: "translate(30%, -30%)",
        pointerEvents: "none"
      }}></div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500, letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </div>
      <div className="kpi-value" style={{ fontWeight: 700, color: "#111", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
        {typeof value === "number" ? value.toLocaleString("id-ID") : value}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const isAdmin = isAdminRole(user?.role);
  const [posts, setPosts] = useState<Post[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("Semua Akun");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [syncedAt, setSyncedAt] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const itemsPerPage = 10;

  async function loadData() {
    try {
      let token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Sumber data: snapshot arsip harian + skor (sync 01:00 WIB), bukan live fetch.
      let res = await fetch("/api/skoring", { headers, cache: 'no-store' });

      if (res.status === 401) {
        token = await getToken(true);
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          res = await fetch("/api/skoring", { headers, cache: 'no-store' });
        }
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
      }

      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; }
      catch { throw new Error('API ' + res.status + ' body bukan JSON (kemungkinan timeout Composio). Coba 1 akun + rentang kecil.'); }

      if (!res.ok || data.error) {
        throw new Error('API ' + res.status + ': ' + (data.error || data.details || text.slice(0, 200)));
      }

      const list: Post[] = Array.isArray(data.posts) ? data.posts : [];
      setAvailableAccounts(data.accounts_fetched || []);
      setSyncedAt(data.meta?.syncedAt || "");

      // Tanpa mock: arsip kosong = sync pertama belum berjalan.

      // Sort descending
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setPosts(list);
      setCurrentPage(1); // Reset page
      setLastUpdated(new Date().toLocaleTimeString("id-ID"));
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError(err.message);
    } finally {
      setIsLoaded(true);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    loadData();
    // Snapshot harian: tidak ada auto-refresh 60 detik lagi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, getToken, router]);

  // Sync manual (admin only): tarik postingan terbaru ke arsip sekarang juga,
  // tanpa menunggu cron 01:00 WIB. Idempoten (upsert per ID) — aman walau
  // berbarengan dengan cron.
  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 290000);
    try {
      let token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      let res = await fetch("/api/ig-sync?run=1", { headers, cache: 'no-store', signal: controller.signal });
      if (res.status === 401) {
        token = await getToken(true);
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          res = await fetch("/api/ig-sync?run=1", { headers, cache: 'no-store', signal: controller.signal });
        }
      }
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; }
      catch { throw new Error(`API ${res.status}: respons bukan JSON.`); }
      if (res.status === 403 || res.status === 401) {
        throw new Error("Hanya admin yang boleh sync manual.");
      }
      if (!res.ok) {
        throw new Error(`API ${res.status}: ${data.error || data.details || text.slice(0, 200)}`);
      }
      setSyncMsg(`Sync sukses: ${data.fetched ?? "?"} ditarik, ${data.appended ?? 0} baru, ${data.updated ?? 0} refresh.`);
      await loadData();
    } catch (err: any) {
      setSyncMsg(err?.name === "AbortError"
        ? "Sync timeout (>5 mnt). Cek halaman Cron Jobs / coba lagi."
        : `Sync gagal: ${err.message}`);
    } finally {
      clearTimeout(timeout);
      setSyncing(false);
    }
  }

  // Label akun: tampilkan handle IG asli (kolom username terbanyak per
  // akun), nilai filter tetap nama internal agar logika tidak berubah.
  const accountLabels = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    for (const p of posts) {
      const src = p.source_account || p.username;
      if (!src) continue;
      if (!counts.has(src)) counts.set(src, new Map());
      const m = counts.get(src)!;
      m.set(p.username || src, (m.get(p.username || src) || 0) + 1);
    }
    const labels = new Map<string, string>();
    for (const [src, m] of counts) {
      let top = src, topN = -1;
      for (const [u, n] of m) if (n > topN) { top = u; topN = n; }
      labels.set(src, top);
    }
    return labels;
  }, [posts]);
  const accountLabel = (acc: string) => accountLabels.get(acc) || acc;

  // Filter akun → statistik + opsi bulan mengikuti akun terpilih;
  // ganti akun me-reset bulan (pola sama seperti monitoring press release).
  const accountPosts = useMemo(() => {
    if (selectedAccount === "Semua Akun") return posts;
    return posts.filter((p) => p.source_account === selectedAccount || p.username === selectedAccount);
  }, [posts, selectedAccount]);

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const p of accountPosts) {
      const k = monthKey(p.timestamp);
      if (k) keys.add(k);
    }
    return [...keys].sort().reverse();
  }, [accountPosts]);

  const filteredPosts = useMemo(() => {
    if (!selectedMonth) return accountPosts;
    return accountPosts.filter((p) => monthKey(p.timestamp) === selectedMonth);
  }, [accountPosts, selectedMonth]);

  const totalReach = filteredPosts.reduce((sum, p) => sum + p.reach, 0);
  const totalImpressions = filteredPosts.reduce((sum, p) => sum + (p.views || p.plays || p.impressions || 0), 0);
  const totalLikes = filteredPosts.reduce((sum, p) => sum + p.likes, 0);
  const totalComments = filteredPosts.reduce((a, p) => a + p.comments, 0);
  const totalSaved = filteredPosts.reduce((a, p) => a + p.saved, 0);
  const totalScore = filteredPosts.reduce((sum, p) => sum + (p.scoring?.score || 0), 0);

  // Tren skor per bulan: ikut filter AKUN saja (abaikan filter bulan),
  // urut kronologis untuk melihat pertumbuhan.
  const monthlyTrend = useMemo(() => {
    const agg = new Map<string, { score: number; count: number }>();
    for (const p of accountPosts) {
      const k = monthKey(p.timestamp);
      if (!k) continue;
      const cur = agg.get(k) || { score: 0, count: 0 };
      cur.score += p.scoring?.score || 0;
      cur.count += 1;
      agg.set(k, cur);
    }
    return [...agg.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [accountPosts]);
  const maxTrendScore = monthlyTrend.reduce((m, [, v]) => Math.max(m, v.score), 0);

  const onAccountChange = (v: string) => {
    setSelectedAccount(v);
    setSelectedMonth("");
    setCurrentPage(1);
  };

  // Cap max 10 pages
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / itemsPerPage));
  const currentPosts = filteredPosts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const filterDesc = [
    selectedAccount !== "Semua Akun" ? accountLabel(selectedAccount) : null,
    selectedMonth ? monthLabel(selectedMonth) : null,
  ].filter(Boolean).join(" • ");

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Medsos Monitoring</h1>
          <p style={{ margin: "5px 0 0 0", fontSize: "0.85rem", color: "#111" }}>
            Snapshot arsip harian (sync 01:00 WIB)
            {syncedAt ? ` • diperbarui ${new Date(syncedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : " • sync pertama belum berjalan"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
          <Link href="/dashboard/skoring">
            <button className="btn" style={{ background: "var(--success)", color: "white", padding: "8px 16px", fontSize: "0.9rem", border: "none" }}>Skoring</button>
          </Link>
          {isAdmin && (
            <button
              className="btn"
              onClick={syncNow}
              disabled={syncing}
              title="Tarik postingan terbaru ke arsip sekarang (tanpa menunggu cron 01:00 WIB)"
              style={{
                background: syncing ? "var(--text-muted)" : "#38bdf8",
                color: "white",
                padding: "8px 16px",
                fontSize: "0.9rem",
                border: "none",
                cursor: syncing ? "wait" : "pointer",
              }}
            >
              {syncing ? "Syncing…" : "Sync Sekarang"}
            </button>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--warning)", fontSize: "0.85rem" }}>
            <span className="live-indicator"></span> Snapshot Harian
          </span>
        </div>
      </header>

      {/* Filter Akun + Bulan */}

      {syncMsg && (
        <div style={{
          marginBottom: "16px",
          padding: "10px 18px",
          borderRadius: "10px",
          fontSize: "0.875rem",
          background: syncMsg.startsWith("Sync sukses") ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.1)",
          color: syncMsg.startsWith("Sync sukses") ? "var(--success)" : "var(--danger)",
          border: "1px solid var(--card-border)",
        }}>
          {syncMsg}
        </div>
      )}      <section style={{ marginBottom: "24px" }}>
        <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Akun</label>
            <select
              value={selectedAccount}
              onChange={(e) => onAccountChange(e.target.value)}
              className="input-field"
              style={{ minWidth: "180px" }}
            >
              <option value="Semua Akun">Semua Akun</option>
              {availableAccounts.map((acc) => (
                <option key={acc} value={acc}>{accountLabel(acc)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Bulan</label>
            <select
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
              className="input-field"
              style={{ minWidth: "180px" }}
            >
              <option value="">Semua Bulan</option>
              {monthOptions.map((k) => (
                <option key={k} value={k}>{monthLabel(k)}</option>
              ))}
            </select>
          </div>
          {filterDesc && (
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", paddingBottom: "8px" }}>
              Filter: {filterDesc}
            </div>
          )}
        </div>
      </section>

      {/* Ringkasan Metrik (mengikuti filter) */}
      <section style={{ marginBottom: "32px" }}>
        <div className="kpi-row">
          <MetricBox label="Total Postingan" value={filteredPosts.length} color="#38bdf8" />
          <MetricBox label="Total Skor" value={Math.round(totalScore)} color="#38bdf8" />
          <MetricBox label="Total Jangkauan" value={totalReach} color="#38bdf8" />
          <MetricBox label="Total Tayangan" value={totalImpressions} color="#38bdf8" />
          <MetricBox label="Total Suka" value={totalLikes} color="#38bdf8" />
          <MetricBox label="Total Komentar" value={totalComments} color="#38bdf8" />
          <MetricBox label="Total Simpan" value={totalSaved} color="#38bdf8" />
        </div>
      </section>

      {/* Tren Skor per Bulan */}
      <section style={{ marginBottom: "32px" }}>
        <div className="glass-panel trend-panel" style={{ padding: "24px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Tren Skor per Bulan</h2>
            <div style={{ fontSize: "0.83rem", color: "var(--text-muted)" }}>
              Mengikuti filter akun{selectedAccount !== "Semua Akun" ? ` (${accountLabel(selectedAccount)})` : ""} • geser untuk histori penuh
            </div>
          </div>
          {monthlyTrend.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Tidak ada data pada filter ini.
            </div>
          ) : (
            <div className="trend-scroll" style={{ display: "flex", alignItems: "flex-end", gap: "14px", overflowX: "auto", paddingBottom: "12px", minHeight: "250px" }}>
              {monthlyTrend.map(([key, val]) => {
                const h = maxTrendScore > 0 ? Math.max(10, Math.round((val.score / maxTrendScore) * 170)) : 10;
                const isSel = selectedMonth === key;
                const short = new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1)
                  .toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
                return (
                  <div
                    key={key}
                    title={`${monthLabel(key)}: ${Math.round(val.score).toLocaleString("id-ID")} skor dari ${val.count} postingan`}
                    onClick={() => { setSelectedMonth(isSel ? "" : key); setCurrentPage(1); }}
                    className="trend-bar"
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: "8px", minWidth: "64px", cursor: "pointer", flexShrink: 0, minHeight: "220px" }}
                  >
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: isSel ? "var(--primary)" : "var(--text-muted)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(val.score).toLocaleString("id-ID")}
                    </div>
                    <div style={{
                      width: "38px",
                      height: `${h}px`,
                      borderRadius: "8px 8px 3px 3px",
                      background: isSel ? "#38bdf8" : "linear-gradient(180deg, #34d399 0%, #10b981 100%)",
                      opacity: isSel ? 1 : 0.9,
                      outline: isSel ? "2px solid #38bdf8" : "none",
                      outlineOffset: "2px",
                      transition: "height 0.3s ease, background 0.2s ease",
                    }}></div>
                    <div style={{ fontSize: "0.72rem", color: isSel ? "var(--primary)" : "var(--text-muted)", fontWeight: isSel ? 700 : 500, whiteSpace: "nowrap" }}>
                      {short}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "8px" }}>
            * Klik bar untuk filter bulan tersebut (klik lagi untuk lepas).
          </div>
        </div>
      </section>

      {/* Tabel Detail */}
      <section>
        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "16px",
          overflow: "hidden",
        }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Daftar Postingan</h2>
            <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              {isLoaded && filteredPosts.length > 0 && `Menampilkan ${filteredPosts.length} postingan${filterDesc ? ` (${filterDesc})` : ` dari ${availableAccounts.length} akun`}`}
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px 24px", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", fontSize: "0.875rem" }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {["TANGGAL", "FORMAT", "JUDUL / HOOK", "TAYANGAN", "JANGKAUAN", "SUKA", "KOMENTAR", "SIMPAN"].map(col => (
                    <th key={col} style={{
                      padding: "12px 16px",
                      textAlign: col === "JUDUL / HOOK" ? "left" : "center",
                      color: "var(--text-muted)",
                      fontWeight: "bold",
                      fontSize: "0.75rem",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!isLoaded ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>
                      <div style={{ display: "inline-block", width: "20px", height: "20px", border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: "10px", verticalAlign: "middle" }}></div>
                      Memuat data dari Instagram...
                    </td>
                  </tr>
                ) : filteredPosts.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>
                      Tidak ada postingan pada filter ini.
                    </td>
                  </tr>
                ) : (
                  currentPosts.map((post, i) => {
                    const hook = post.caption
                      ? (post.caption.length > 60 ? post.caption.substring(0, 60) + "…" : post.caption)
                      : "No Caption";

                    return (
                      <tr key={post.id} style={{
                        borderBottom: "1px solid var(--card-border)",
                        transition: "background 0.15s",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                          {formatDate(post.timestamp)}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "center" }}>
                          <FormatBadge mediaType={post.media_type} />
                        </td>
                        <td style={{ padding: "13px 16px", maxWidth: "320px" }}>
                          <a href={post.permalink} target="_blank" rel="noopener noreferrer" style={{
                            color: "var(--text)",
                            textDecoration: "none",
                            fontWeight: 500,
                            lineHeight: 1.4,
                          }}
                            onMouseEnter={e => (e.currentTarget.style.color = "var(--primary)")}
                            onMouseLeave={e => (e.currentTarget.style.color = "var(--text)")}
                          >
                            {hook}
                          </a>
                        </td>
                        {[
                          { val: post.views || post.plays || post.impressions || 0, color: "#0ea5e9" },
                          { val: post.reach, color: "#8b5cf6" },
                          { val: post.likes, color: "var(--danger)" },
                          { val: post.comments, color: "var(--success)" },
                          { val: post.saved, color: "#f59e0b" },
                        ].map(({ val }, idx) => (
                          <td key={idx} style={{ padding: "13px 16px", textAlign: "center", fontWeight: 600, color: "#111" }}>
                            {val.toLocaleString("id-ID")}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--card-border)" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Menampilkan halaman {currentPage} dari {totalPages}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--card-border)",
                    background: currentPage === 1 ? "rgba(0,0,0,0.05)" : "white",
                    color: currentPage === 1 ? "var(--text-muted)" : "var(--text)",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer"
                  }}
                >
                  Sebelumnya
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--card-border)",
                    background: currentPage === totalPages ? "rgba(0,0,0,0.05)" : "white",
                    color: currentPage === totalPages ? "var(--text-muted)" : "var(--text)",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer"
                  }}
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        /* ===== Desktop-first KPI grid (mobile tetap 2 kolom via media query) ===== */
        .kpi-row {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }
        .kpi-card .kpi-value {
          font-size: 1.65rem;
        }
        /* Layar < 1280px: 4 kolom — cegah angka 8 digit pecah baris */
        @media (max-width: 1280px) {
          .kpi-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        /* Tablet: 3 kolom */
        @media (max-width: 900px) {
          .kpi-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .kpi-card .kpi-value { font-size: 1.4rem; }
        }
        /* HP: 2 kolom (tetap ringkas, tidak setinggi 7 baris vertikal) */
        @media (max-width: 600px) {
          .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
          .kpi-card .kpi-value { font-size: 1.25rem; }
          .trend-panel { padding: 20px !important; }
          .trend-scroll { min-height: 200px !important; }
          .trend-bar { min-width: 52px !important; min-height: 170px !important; }
        }
        /* Scrollbar halus untuk tren di desktop */
        .trend-scroll::-webkit-scrollbar { height: 8px; }
        .trend-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 999px; }
        .trend-scroll::-webkit-scrollbar-track { background: transparent; }
        .trend-bar:hover > div:nth-child(2) { filter: brightness(1.08); }
      `}</style>
    </div>
  );
}
