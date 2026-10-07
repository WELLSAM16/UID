"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/authContext";
import { UNIT_OPTIONS, formatUnitDisplay } from "@/lib/roles";

interface RecapRow {
  unitId: string;
  entries: number;
  medmasScore: number;
  medsosScore: number;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(bulan: string): { start: string; end: string } {
  const [y, m] = bulan.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${last}` };
}

/**
 * Rekap bulanan KPI 2 — pengganti file "Skoring UP Medmas/Medsos - {Bulan}"
 * + "Rekap Scoring". Medmas dari entri approved; Medsos per unit dari arsip IG
 * berdasarkan unitId akun terpantau (/api/monitored-accounts).
 * Akun yang belum dipetakan unitnya masuk baris "Belum Terpetakan".
 */
export default function RekapPage() {
  const { user, getToken } = useAuth();
  const [bulan, setBulan] = useState(currentMonth());
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [medsosTotal, setMedsosTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "administrator" || user?.role === "admin_uid" || (user?.role as string) === "admin";

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [medmasRes, skoringRes, accountsRes] = await Promise.all([
        fetch(`/api/medmas?bulan=${bulan}`, { headers, cache: "no-store" }),
        (() => {
          const { start, end } = monthRange(bulan);
          return fetch(`/api/skoring?startDate=${start}&endDate=${end}`, { headers, cache: "no-store" });
        })(),
        fetch(`/api/monitored-accounts`, { headers, cache: "no-store" }).catch(() => null),
      ]);
      const medmas = await medmasRes.json().catch(() => ({}));
      if (!medmasRes.ok) throw new Error(medmas.error || `Medmas API ${medmasRes.status}`);
      const sk = await skoringRes.json().catch(() => ({ posts: [] }));
      const mu = await accountsRes?.json().catch(() => ({ accounts: [] })) || { accounts: [] };
      const unitOf: Record<string, string> = {};
      for (const a of (Array.isArray(mu.accounts) ? mu.accounts : [])) {
        if (a?.username && a?.unitId) unitOf[String(a.username)] = String(a.unitId);
      }

      const approved = ((medmas.entries || []) as any[]).filter((e) => e.status === "approved");
      const byUnit = new Map<string, RecapRow>();
      for (const e of approved) {
        const u = String(e.unitId || "?");
        const r = byUnit.get(u) || { unitId: u, entries: 0, medmasScore: 0, medsosScore: 0 };
        r.entries += 1;
        r.medmasScore += Number(e.skor) || 0;
        byUnit.set(u, r);
      }
      const units = isAdmin ? [...UNIT_OPTIONS] : user?.unitId ? [user.unitId] : [];
      setRows(units.map((u) => byUnit.get(u) || { unitId: u, entries: 0, medmasScore: 0, medsosScore: 0 }));

      const posts = Array.isArray(sk.posts) ? sk.posts : [];
      const medsosByUnit = new Map<string, number>();
      let medsosUnmapped = 0;
      for (const p of posts) {
        const s = Number(p?.scoring?.score) || 0;
        const u = unitOf[String(p?.source_account || "")] || unitOf[String(p?.username || "")];
        if (u) medsosByUnit.set(u, (medsosByUnit.get(u) || 0) + s);
        else medsosUnmapped += s;
      }
      const withMedsos = units.map((u) => {
        const r = byUnit.get(u) || { unitId: u, entries: 0, medmasScore: 0, medsosScore: 0 };
        return { ...r, medsosScore: medsosByUnit.get(u) || 0 };
      });
      if (medsosUnmapped > 0) {
        withMedsos.push({ unitId: "Belum Terpetakan", entries: 0, medmasScore: 0, medsosScore: medsosUnmapped });
      }
      setRows(withMedsos);

      const total = posts.reduce((s: number, p: any) => s + (Number(p?.scoring?.score) || 0), 0);
      setMedsosTotal(total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bulan]);

  const exportXlsx = () => {
    const data = rows.map((r) => ({
      Unit: r.unitId,
      "Entri Medmas (approved)": r.entries,
      "Skor Medmas": r.medmasScore,
      "Skor Medsos": Math.round(r.medsosScore),
    }));
    data.push({ Unit: "TOTAL MEDSOS (semua akun)", "Entri Medmas (approved)": 0 as never, "Skor Medmas": 0 as never, "Skor Medsos": Math.round(medsosTotal || 0) as never } as any);
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Rekap ${bulan}`);
    XLSX.writeFile(wb, `rekap-kpi2-${bulan}.xlsx`);
  };

  const totalMedmas = rows.reduce((s, r) => s + r.medmasScore, 0);
  const unitLabel = (u: string) => (u === "Belum Terpetakan" ? u : formatUnitDisplay(u));

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Rekap Bulanan KPI 2</h1>
          <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Medmas approved + skor Medsos per unit. Akun yang belum dipetakan unitnya masuk baris "Belum Terpetakan".
          </p>
      </header>

      {error && (
        <div style={{ marginBottom: "16px", padding: "10px 18px", borderRadius: "10px", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid var(--card-border)" }}>
          {error}
        </div>
      )}

      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.8rem", fontWeight: 600 }}>Bulan</label>
            <input className="input-field" type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} />
          </div>
          <button className="btn" onClick={loadData} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
            Muat ulang
          </button>
          <button className="btn btn-primary" onClick={exportXlsx} disabled={loading} style={{ marginLeft: "auto" }}>
            Ekspor XLSX
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["UNIT", "ENTRI MEDMAS", "SKOR MEDMAS", "SKOR MEDSOS"].map((c) => (
                  <th key={c} style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: "bold", fontSize: "0.75rem", letterSpacing: "0.06em" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Memuat...</td></tr>
              ) : (
                <>
                  {rows.map((r) => (
                    <tr key={r.unitId} style={{ borderBottom: "1px solid var(--card-border)" }}>
                      <td style={{ padding: "13px 16px", fontWeight: 600 }}>{unitLabel(r.unitId)}</td>
                      <td style={{ padding: "13px 16px" }}>{r.entries}</td>
                      <td style={{ padding: "13px 16px", fontWeight: 600 }}>{r.medmasScore.toLocaleString("id-ID")}</td>
                      <td style={{ padding: "13px 16px", fontWeight: 600 }}>{Math.round(r.medsosScore).toLocaleString("id-ID")}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "rgba(59,130,246,0.06)", fontWeight: 700 }}>
                    <td style={{ padding: "13px 16px" }}>TOTAL MEDMAS</td>
                    <td style={{ padding: "13px 16px" }}>{rows.reduce((s, r) => s + r.entries, 0)}</td>
                    <td style={{ padding: "13px 16px" }}>{totalMedmas.toLocaleString("id-ID")}</td>
                    <td style={{ padding: "13px 16px" }}>—</td>
                  </tr>
                  <tr style={{ background: "rgba(16,185,129,0.06)", fontWeight: 700 }}>
                    <td style={{ padding: "13px 16px" }}>TOTAL MEDSOS (semua akun)</td>
                    <td style={{ padding: "13px 16px" }}>—</td>
                    <td style={{ padding: "13px 16px" }}>—</td>
                    <td style={{ padding: "13px 16px" }}>{medsosTotal === null ? "—" : Math.round(medsosTotal).toLocaleString("id-ID")}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
