/**
 * Kerangka Stakeholder — integrasi KPI 5 & 6 (matriks Mendelow).
 *
 * Sumber angka: spreadsheet KPI UID Jaya (Okt 2026).
 * - KPI 5 = kuadran Manage Closely + Keep Informed
 * - KPI 6 = kuadran Keep Satisfied + Monitor
 * Penilaian: % capaian = realisasi / target (cap 110%), dirata-rata berbobot.
 *
 * Koleksi Firestore (API menyusul):
 * - stakeholders           : database stakeholder per unit
 * - stakeholder_activities : realisasi kegiatan per bulan + bukti Storage
 * - kpi_targets            : target & bobot (di-seed dari konstanta di bawah)
 */

export const STAKEHOLDER_QUADRANTS = [
  "Manage Closely",
  "Keep Informed",
  "Keep Satisfied",
  "Monitor",
] as const;
export type StakeholderQuadrant = (typeof STAKEHOLDER_QUADRANTS)[number];

export type KpiNumber = 5 | 6;
export type ActivityPeriod = "bulanan" | "semesteran";

export interface KpiActivity {
  key: string;
  kpi: KpiNumber;
  quadrant: StakeholderQuadrant;
  label: string;
  target: number;
  targetLabel: string;
  period: ActivityPeriod;
  weight: number;
}

export const KPI_ACTIVITIES: KpiActivity[] = [
  // KPI 5
  { key: "audiensi", kpi: 5, quadrant: "Manage Closely", label: "Audiensi / Pertemuan Informal", target: 5, targetLabel: "5x per bulan", period: "bulanan", weight: 3 },
  { key: "event_bersama", kpi: 5, quadrant: "Manage Closely", label: "Event Bersama", target: 3, targetLabel: "3x per semester", period: "semesteran", weight: 5 },
  { key: "share_wag", kpi: 5, quadrant: "Keep Informed", label: "Share Informasi WAG", target: 7, targetLabel: "7x per bulan", period: "bulanan", weight: 1 },
  { key: "sosialisasi", kpi: 5, quadrant: "Keep Informed", label: "Sosialisasi", target: 6, targetLabel: "6x per bulan", period: "bulanan", weight: 2 },
  // KPI 6
  { key: "audiensi", kpi: 6, quadrant: "Keep Satisfied", label: "Audiensi / Pertemuan Informal", target: 5, targetLabel: "5x per bulan", period: "bulanan", weight: 3 },
  { key: "sapa_personal", kpi: 6, quadrant: "Keep Satisfied", label: "Sapa Personal", target: 7, targetLabel: "7x per bulan", period: "bulanan", weight: 1 },
  { key: "share_wag", kpi: 6, quadrant: "Monitor", label: "Share Informasi WAG", target: 7, targetLabel: "7x per bulan", period: "bulanan", weight: 1 },
  { key: "influencer", kpi: 6, quadrant: "Monitor", label: "Kerja Sama Influencer / Opinion Leader", target: 2, targetLabel: "2x per semester", period: "semesteran", weight: 5 },
];

/** Batas atas % capaian per aktivitas (contoh sheet: 110%). */
export const ACHIEVEMENT_CAP = 1.1;

/** % capaian satu aktivitas, sudah di-cap. */
export function achievementPercent(realisasi: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(realisasi / target, ACHIEVEMENT_CAP) * 100;
}

export interface Stakeholder {
  id: string;
  unitId: string;
  nama: string;
  jabatan?: string | null;
  quadrant: StakeholderQuadrant;
  noHpPimpinan?: string | null;
  tglUltahPimpinan?: string | null;
  noHpPic?: string | null;
}

export type ActivityStatus = "draft" | "pending" | "approved" | "rejected";

export interface StakeholderActivity {
  id: string;
  unitId: string;
  kpi: KpiNumber;
  activityKey: string;
  bulan: number; // 1-12
  tahun: number;
  jumlah: number;
  evidencePaths?: string[]; // path Firebase Storage (tanpa link eksternal)
  status: ActivityStatus;
  authorUid: string;
}
