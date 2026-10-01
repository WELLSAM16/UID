/**
 * Tipe + statistik read-only untuk Monitoring Press Release.
 *
 * Sumber: Google Sheet publik (dibaca server via gviz JSON, tanpa API key).
 * Web TIDAK menulis ke sheet — murni monitoring.
 */

export interface PressRelease {
  no: number | null;
  dateText: string;
  day: number | null;
  month: number | null;
  year: number | null;
  unit: string;
  title: string;
  evidenceUrl: string;
}

export interface UnitStat {
  unit: string;
  realisasi: number;
  target: number;
  selisih: number;
  /** Persentase capaian, cap 120%, min 0% (aturan KPI sheet) */
  percent: number;
}

export interface MonthStat {
  year: number;
  month: number;
  count: number;
}

export interface Anomaly {
  type: "bad-year" | "missing-evidence" | "title-looks-like-file" | "duplicate-title" | "bad-date";
  message: string;
  ref: string;
}

/** Target default per unit per semester (sesuai rekap sheet: 12). */
export const TARGET_PER_UNIT = 12;
/** Tahun periode yang dianggap valid (Semester 2 2026). */
export const VALID_YEAR = 2026;

const MONTH_NAMES = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month] || `Bulan ${month}`} ${year}`;
}

function capPercent(realisasi: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(120, Math.max(0, Math.round((realisasi / target) * 100)));
}

/** Rekap per unit: realisasi, target, selisih, % (cap 120%). */
export function buildUnitStats(
  releases: PressRelease[],
  targetPerUnit = TARGET_PER_UNIT
): UnitStat[] {
  const counts = new Map<string, number>();
  for (const r of releases) {
    if (!r.unit) continue;
    counts.set(r.unit, (counts.get(r.unit) || 0) + 1);
  }
  const stats: UnitStat[] = [...counts.entries()].map(([unit, realisasi]) => ({
    unit,
    realisasi,
    target: targetPerUnit,
    selisih: realisasi - targetPerUnit,
    percent: capPercent(realisasi, targetPerUnit),
  }));
  stats.sort((a, b) => b.realisasi - a.realisasi || a.unit.localeCompare(b.unit));
  return stats;
}

/** Tren jumlah rilis per bulan (hanya tanggal valid). */
export function buildMonthlyStats(releases: PressRelease[]): MonthStat[] {
  const counts = new Map<string, MonthStat>();
  for (const r of releases) {
    if (!r.year || !r.month || r.month < 1 || r.month > 12) continue;
    const key = `${r.year}-${r.month}`;
    const cur = counts.get(key) || { year: r.year, month: r.month, count: 0 };
    cur.count += 1;
    counts.set(key, cur);
  }
  return [...counts.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
}

/** Deteksi anomali kualitas data untuk ditindaklanjuti di sheet. */
export function detectAnomalies(
  releases: PressRelease[],
  validYear = VALID_YEAR
): Anomaly[] {
  const out: Anomaly[] = [];
  const seen = new Map<string, string>();

  releases.forEach((r, i) => {
    const ref = r.no !== null ? `No ${r.no}` : `Baris ${i + 1}`;

    if (r.year !== null && r.year !== validYear) {
      out.push({ type: "bad-year", message: `Tahun ${r.year} di luar periode ${validYear}`, ref });
    }
    if (r.day === null || r.month === null || r.year === null) {
      out.push({ type: "bad-date", message: `Tanggal tidak valid: "${r.dateText || "-"}"`, ref });
    }
    if (!r.evidenceUrl) {
      out.push({ type: "missing-evidence", message: "Link evidence kosong", ref });
    }
    if (/\.(jpe?g|png|pdf|docx?)\s*$/i.test(r.title || "")) {
      out.push({ type: "title-looks-like-file", message: "Judul tampak seperti nama file — cek kolom evidence", ref });
    }
    const key = (r.title || "").trim().toLowerCase();
    if (key) {
      if (seen.has(key)) {
        out.push({ type: "duplicate-title", message: `Judul duplikat dengan ${seen.get(key)}`, ref });
      } else {
        seen.set(key, ref);
      }
    }
  });

  return out;
}

export interface PressSummary {
  totalReleases: number;
  totalUnits: number;
  avgPerUnit: number;
  totalTarget: number;
  percentCapped: number;
}

export function buildSummary(releases: PressRelease[], units: UnitStat[]): PressSummary {
  const totalReleases = releases.length;
  const totalUnits = units.length;
  const totalTarget = units.reduce((s, u) => s + u.target, 0);
  return {
    totalReleases,
    totalUnits,
    avgPerUnit: totalUnits > 0 ? Math.round((totalReleases / totalUnits) * 10) / 10 : 0,
    totalTarget,
    percentCapped: capPercent(totalReleases, totalTarget),
  };
}
