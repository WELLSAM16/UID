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

/* ------------------------------------------------------------------ */
/* Kerangka pengisian KPI 6 (Keep Satisfied + Monitor).                */
/*                                                                    */
/* Alur workflow: TL mengisi satu entri per kegiatan (judul + tanggal  */
/* + tingkat pengaruh/kepentingan + bukti). Sistem menurunkan kuadran  */
/* otomatis dan menolak kombinasi yang masuk KPI 5. JUMLAH dihitung    */
/* otomatis dari banyaknya entri (tidak diketik manual seperti sheet). */
/* API Firestore (/api/stakeholder-activities) menyusul — payload di   */
/* bawah sudah berbentuk siap kirim.                                   */
/* ------------------------------------------------------------------ */

/** Tingkat pengaruh & kepentingan stakeholder (pengganti teks bebas). */
export const INFLUENCE_LEVELS = ["rendah", "sedang", "tinggi"] as const;
export type InfluenceLevel = (typeof INFLUENCE_LEVELS)[number];

export const INTEREST_LEVELS = ["rendah", "sedang", "tinggi"] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

/** Matriks Mendelow: pengaruh × kepentingan → kuadran. */
export function quadrantFor(
  pengaruh: InfluenceLevel,
  kepentingan: InterestLevel
): StakeholderQuadrant {
  if (pengaruh === "tinggi" && kepentingan === "tinggi") return "Manage Closely";
  if (pengaruh === "tinggi") return "Keep Satisfied";
  if (kepentingan === "tinggi") return "Keep Informed";
  return "Monitor";
}

/** Kuadran → nomor KPI (kuadran unik per KPI). */
export function kpiForQuadrant(q: StakeholderQuadrant): KpiNumber | null {
  const act = KPI_ACTIVITIES.find((a) => a.quadrant === q);
  return act ? act.kpi : null;
}

/** Daftar aktivitas KPI 6 saja (form pengisian). */
export function kpi6Activities(): KpiActivity[] {
  return KPI_ACTIVITIES.filter((a) => a.kpi === 6);
}

/** Satu entri kegiatan yang sedang diisi TL (belum terkirim). */
export interface EntryDraft {
  activityKey: string;
  tanggal: string; // YYYY-MM-DD
  judul: string;
  pengaruh: InfluenceLevel | "";
  kepentingan: InterestLevel | "";
  keterangan: string;
}

/** Validasi draf entri. Return pesan error atau null bila OK. */
export function validateEntryDraft(d: EntryDraft): string | null {
  if (!kpi6Activities().some((a) => a.key === d.activityKey))
    return "Pilih jenis kegiatan KPI 6";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal)) return "Tanggal tidak valid";
  if (d.judul.trim().length < 10) return "Judul kegiatan minimal 10 karakter";
  if (!d.pengaruh || !d.kepentingan)
    return "Pilih tingkat pengaruh dan kepentingan";
  if (d.keterangan.trim().length < 20)
    return "Keterangan minimal 20 karakter (agar tidak ditolak Asman)";
  const q = quadrantFor(d.pengaruh, d.kepentingan);
  if (kpiForQuadrant(q) !== 6)
    return `Kombinasi ini masuk kuadran ${q} (KPI 5). Halaman ini khusus KPI 6.`;
  return null;
}

export interface PayloadContext {
  unitId: string;
  authorUid: string;
  bulan: number;
  tahun: number;
}

/** Bentuk dokumen stakeholder_activities untuk API (satu dokumen = satu kegiatan). */
export function buildActivityPayload(d: EntryDraft, ctx: PayloadContext) {
  const quadrant = quadrantFor(
    d.pengaruh as InfluenceLevel,
    d.kepentingan as InterestLevel
  );
  return {
    unitId: ctx.unitId,
    kpi: 6 as const,
    activityKey: d.activityKey,
    quadrant,
    tanggal: d.tanggal,
    judul: d.judul.trim(),
    keteranganKepentingan: d.keterangan.trim(),
    bulan: ctx.bulan,
    tahun: ctx.tahun,
    jumlah: 1,
    evidencePlaceholders: [] as string[],
    status: "draft" as const,
    authorUid: ctx.authorUid,
  };
}
