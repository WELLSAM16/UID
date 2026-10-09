/**
 * Kerangka Stakeholder — pengganti spreadsheet KPI 5 & 6 (official UID).
 *
 * Penomoran resmi UID:
 * - KPI 5 = Manage Closely + Keep Informed
 * - KPI 6 = Keep Satisfied + Monitor
 *
 * Sumber angka: paparan SM I & Progja SM II 2026 + kedua sheet kertas kerja.
 * - KPI 5, Level 4, Max 110%: Cluster A 5x/bln, 3x/sem, 7x/bln, 6x/bln;
 *   Cluster B 4x/bln, 2x/sem, 5x/bln, 3x/bln.
 * - KPI 6, Level 4, Max 100%: Cluster A 5x/bln, 7x/bln, 7x/bln, 2x/sem;
 *   Cluster B 3x/bln, 5x/bln, 5x/bln, 1x/sem.
 * - Level 5 = melebihi Level 4 (> target).
 *
 * Koleksi Firestore:
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

/** Nomor KPI resmi UID: 5|6. */
export type KpiNumber = 5 | 6;
/** Peta kode lama → resmi: 7→6 (dipakai bila tanpa konteks kuadran). */
export const LEGACY_KPI_MAP: Record<number, KpiNumber> = { 7: 6 };
/** Normalisasi nomor apa pun ke resmi; bila ada kuadran, kuadran menang. */
export function normalizeKpi(kpi: number, quadrant?: StakeholderQuadrant): KpiNumber | null {
  if (kpi === 5 || kpi === 6) {
    if (quadrant) return kpiForQuadrantStrict(quadrant);
    return kpi;
  }
  const mapped = LEGACY_KPI_MAP[kpi];
  return mapped ?? null;
}
export function kpiForQuadrantStrict(q: StakeholderQuadrant): KpiNumber {
  return q === "Manage Closely" || q === "Keep Informed" ? 5 : 6;
}
/** Kompat: nama lama, kini mengembalikan nomor resmi 5|6. */
export function kpiForQuadrant(q: StakeholderQuadrant): KpiNumber | null {
  return kpiForQuadrantStrict(q);
}
export type ClusterId = "A" | "B";
export type ActivityPeriod = "bulanan" | "semesteran";

/** UP2D Jakarta = Cluster B, sisanya (16 UP3 + UID) = Cluster A. */
export function clusterForUnit(unitId?: string | null): ClusterId {
  const v = (unitId || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (v === "UP2D" || v === "UP2D JAKARTA" || v === "UP2D JAYA") return "B";
  return "A";
}

/** Target Level 4 per cluster — angka resmi paparan + sheet. */
export const CLUSTER_TARGETS: Record<string, Record<ClusterId, number>> = {
  "5:audiensi": { A: 5, B: 4 },
  "5:event_bersama": { A: 3, B: 2 },
  "5:share_wag": { A: 7, B: 5 },
  "5:sosialisasi": { A: 6, B: 3 },
  "6:audiensi": { A: 5, B: 3 },
  "6:sapa_personal": { A: 7, B: 5 },
  "6:share_wag": { A: 7, B: 5 },
  "6:influencer": { A: 2, B: 1 },
};
export function targetFor(kpi: KpiNumber, activityKey: string, cluster: ClusterId): number {
  return CLUSTER_TARGETS[`${kpi}:${activityKey}`]?.[cluster] ?? 0;
}
/** Cap % capaian: KPI 5 max 110%, KPI 6 max 100%. */
export const KPI_CAPS: Record<KpiNumber, number> = { 5: 1.1, 6: 1.0 };
export function capForKpi(kpi: KpiNumber): number {
  return KPI_CAPS[kpi] ?? 1.0;
}
/** Level realisasi sheet: < target = di bawah 4; = target → 4; > target → 5. */
export function realisasiLevel(jumlah: number, target: number): number {
  if (jumlah >= target && target > 0) return jumlah > target ? 5 : 4;
  if (jumlah >= Math.ceil(target * 0.85)) return 3;
  if (jumlah > 0) return 2;
  return 1;
}
/** Aturan penamaan kertas kerja + eviden sheet (diringkas, validasi lunak). */
export const FILENAME_RULE =
  "Format: Nama stakeholder_ Kegiatan_DDMMYYYY (cth: Camat Pondok Aren_Masak Asik Pakai Kompor Listrik_18062026)";
export function validateJudulFormat(judul: string): string | null {
  const v = (judul || "").trim();
  if (!v.includes("_")) return `Judul wajib memakai underscore: ${FILENAME_RULE}`;
  if (!/\d{6,8}\s*$/.test(v.replace(/[-/.]/g, ""))) return `Judul wajib diakhiri tanggal: ${FILENAME_RULE}`;
  return null;
}

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
  // KPI 5 resmi (Manage Closely + Keep Informed) — target default Cluster A
  { key: "audiensi", kpi: 5, quadrant: "Manage Closely", label: "Audiensi / Pertemuan Informal", target: 5, targetLabel: "5x per bulan (A) / 4x (B)", period: "bulanan", weight: 3 },
  { key: "event_bersama", kpi: 5, quadrant: "Manage Closely", label: "Event Bersama", target: 3, targetLabel: "3x per semester (A) / 2x (B)", period: "semesteran", weight: 5 },
  { key: "share_wag", kpi: 5, quadrant: "Keep Informed", label: "Share Informasi WAG", target: 7, targetLabel: "7x per bulan (A) / 5x (B)", period: "bulanan", weight: 1 },
  { key: "sosialisasi", kpi: 5, quadrant: "Keep Informed", label: "Sosialisasi", target: 6, targetLabel: "6x per bulan (A) / 3x (B)", period: "bulanan", weight: 2 },
  // KPI 6 resmi (Keep Satisfied + Monitor)
  { key: "audiensi", kpi: 6, quadrant: "Keep Satisfied", label: "Audiensi / Pertemuan Informal", target: 5, targetLabel: "5x per bulan (A) / 3x (B)", period: "bulanan", weight: 3 },
  { key: "sapa_personal", kpi: 6, quadrant: "Keep Satisfied", label: "Sapa Personal", target: 7, targetLabel: "7x per bulan (A) / 5x (B)", period: "bulanan", weight: 1 },
  { key: "share_wag", kpi: 6, quadrant: "Monitor", label: "Share Informasi WAG", target: 7, targetLabel: "7x per bulan (A) / 5x (B)", period: "bulanan", weight: 1 },
  { key: "influencer", kpi: 6, quadrant: "Monitor", label: "Kerja Sama Influencer / Opinion Leader", target: 2, targetLabel: "2x per semester (A) / 1x (B)", period: "semesteran", weight: 5 },
];

/** Batas atas legacy (KPI 5 = 110%). Gunakan capForKpi untuk nilai resmi. */
export const ACHIEVEMENT_CAP = 1.1;

/** % capaian satu aktivitas. Tanpa kpi → perilaku lama (cap 110%). */
export function achievementPercent(realisasi: number, target: number, kpi?: KpiNumber): number {
  if (!target || target <= 0) return 0;
  const cap = kpi ? capForKpi(kpi) : ACHIEVEMENT_CAP;
  return Math.min(realisasi / target, cap) * 100;
}

export interface Stakeholder {
  id: string;
  unitId: string;
  /** Kolom 1 SPS: Instansi/lembaga/perusahaan. */
  instansi: string;
  /** Kolom 2: Alamat kantor. */
  alamat: string;
  /** Kolom 3: Nama pimpinan. */
  namaPimpinan: string;
  /** Kolom 4: Nomor telepon kantor. */
  telpKantor: string;
  /** Kolom 5 (-): Nomor HP pimpinan — opsional. */
  noHpPimpinan?: string | null;
  /** Kolom 6 (-): Tanggal ulang tahun pimpinan — opsional. */
  tglUltahPimpinan?: string | null;
  /** Kolom 7: Nama PIC. */
  namaPic: string;
  /** Kolom 8 (-): Nomor HP PIC — opsional. */
  noHpPic?: string | null;
  /** Kolom 9: Hari ulang tahun lembaga/instansi/perusahaan. */
  hutLembaga: string;
  /** Kolom 10: Isu. */
  isu: string;
  /** Kolom 11: Sikap stakeholder (cth: PEMERINTAH, KEPOLISIAN, KEJARI). */
  sikap: string;
  /** Kolom 12: Maping kuadran Mendelow. */
  quadrant: StakeholderQuadrant;
  /** Kolom 13: Tujuan pengelolaan. */
  tujuan: string;
  /** Kolom 14: Metode pengelolaan. */
  metode: string;
  /** Kolom 15: Pelaksana. */
  pelaksana: string;
  /** Kolom 16: Waktu. */
  waktu: string;
  /** Kolom 17: Tarif/daya listrik (semua IDPEL). */
  tarifDaya: string;
  /** Kolom 18 (-): Pemeliharaan — opsional. */
  pemeliharaan?: string | null;
  /** Kolom 19: MOU/PKS. */
  mouPks: string;
  /** Kolom 20: Kerjasama dengan anak perusahaan. */
  kerjasamaAnak: string;
  // Kompat lama (pra-SPS): nama = instansi, jabatan = namaPimpinan.
  nama?: string | null;
  jabatan?: string | null;
  authorUid?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Nilai placeholder sheet yang dihitung KOSONG untuk % kelengkapan. */
export const STAKEHOLDER_PLACEHOLDERS = [
  "on proggress",
  "on progress",
  "belum ada",
  "tidak ada",
  "tersimpan sesuai peruntukan",
] as const;

/** Kolom opsional (-) sesuai catatan Rekap: boleh kosong tanpa penalti. */
export const STAKEHOLDER_OPTIONAL_COLS = [
  "noHpPimpinan",
  "tglUltahPimpinan",
  "noHpPic",
  "pemeliharaan",
] as const;

/** Kolom wajib (16 dari 20). */
export const STAKEHOLDER_REQUIRED_COLS = [
  "instansi",
  "alamat",
  "namaPimpinan",
  "telpKantor",
  "namaPic",
  "hutLembaga",
  "isu",
  "sikap",
  "quadrant",
  "tujuan",
  "metode",
  "pelaksana",
  "waktu",
  "tarifDaya",
  "mouPks",
  "kerjasamaAnak",
] as const;

/** Opsi sikap stakeholder (dari data SPS; tetap boleh teks bebas). */
export const STAKEHOLDER_SIKAP_OPTIONS = [
  "PEMERINTAH",
  "KEPOLISIAN",
  "KEJARI",
  "Pelanggan VVIP",
  "MEDIA",
  "KOMUNITAS",
  "AKADEMISI",
  "BUMN/BUMD",
] as const;

function isPlaceholder(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return true;
  return (STAKEHOLDER_PLACEHOLDERS as readonly string[]).includes(s);
}

/** % kelengkapan satu record (0–100): sel terisi non-placeholder / 20 kolom. */
export function stakeholderCompleteness(s: Record<string, unknown>): number {
  const cols = [...STAKEHOLDER_REQUIRED_COLS, ...STAKEHOLDER_OPTIONAL_COLS];
  const filled = cols.filter((c) => !isPlaceholder(s[c])).length;
  return Math.round((filled / cols.length) * 100);
}

export interface StakeholderValidation {
  ok: boolean;
  error?: string;
}

function hasMinDigits(v: string, min: number): boolean {
  return v.replace(/\D/g, "").length >= min;
}

/** Validasi body create/update database stakeholder (cerminan 20 kolom SPS). */
export function validateStakeholder(input: Record<string, unknown>): StakeholderValidation {
  const s = (k: string) => String(input[k] ?? "").trim();
  const labels: Record<string, string> = {
    instansi: "Instansi/lembaga/perusahaan",
    alamat: "Alamat kantor",
    namaPimpinan: "Nama pimpinan",
    telpKantor: "Nomor telepon kantor",
    namaPic: "Nama PIC",
    hutLembaga: "Hari ulang tahun lembaga",
    isu: "Isu",
    sikap: "Sikap stakeholder",
    tujuan: "Tujuan pengelolaan",
    metode: "Metode pengelolaan",
    pelaksana: "Pelaksana",
    waktu: "Waktu",
    tarifDaya: "Tarif/daya listrik",
    mouPks: "MOU/PKS",
    kerjasamaAnak: "Kerjasama anak perusahaan",
  };
  for (const k of STAKEHOLDER_REQUIRED_COLS) {
    if (k === "quadrant") continue;
    if (!s(k)) return { ok: false, error: `${labels[k] || k} wajib diisi` };
  }
  if (!(STAKEHOLDER_QUADRANTS as readonly string[]).includes(s("quadrant")))
    return { ok: false, error: `Maping kuadran harus salah satu: ${STAKEHOLDER_QUADRANTS.join(", ")}` };
  // Kolom HP opsional: bila diisi, minimal terkandung 9 digit (format SPS
  // multi-nomor + nama, cth "0812... (Dedi); 0813... (Danny)" tetap lolos).
  for (const k of ["noHpPimpinan", "noHpPic"] as const) {
    const v = s(k);
    if (v && !hasMinDigits(v, 9))
      return { ok: false, error: `${k === "noHpPimpinan" ? "No HP pimpinan" : "No HP PIC"} harus memuat minimal 9 digit angka` };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Alur review dua tingkat (disepakati):                               */
/* TL isi (draft) → Asman review (ACC → acc_asman, tolak → revisi_tl)  */
/* → TL kirim ke Admin UID (pending_admin) → Admin UID evaluasi final  */
/* (lolos → approved, catatan → revisi_tl → TL perbaiki).               */
/* ------------------------------------------------------------------ */

export const ACTIVITY_STATUSES = [
  "draft",
  "pending_asman",
  "revisi_tl",
  "acc_asman",
  "pending_admin",
  "approved",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: "Draf TL",
  pending_asman: "Menunggu review Asman",
  revisi_tl: "Revisi TL",
  acc_asman: "ACC Asman — siap ke Admin UID",
  pending_admin: "Menunggu evaluasi Admin UID",
  approved: "Lolos final",
};

/** Aktor yang boleh menggerakkan status (role disederhanakan). */
export type ReviewActor = "tl" | "asman" | "admin_uid" | "administrator";

/** Transisi yang boleh dilakukan aktor dari suatu status. */
export function allowedTransitions(
  from: ActivityStatus,
  actor: ReviewActor
): ActivityStatus[] {
  if (actor === "administrator") return [...ACTIVITY_STATUSES];
  if (actor === "tl") {
    if (from === "draft" || from === "revisi_tl") return ["pending_asman"];
    if (from === "acc_asman") return ["pending_admin"];
    return [];
  }
  if (actor === "asman") {
    if (from === "pending_asman") return ["acc_asman", "revisi_tl"];
    return [];
  }
  if (actor === "admin_uid") {
    if (from === "pending_admin") return ["approved", "revisi_tl"];
    return [];
  }
  return [];
}

export interface StakeholderActivity {
  id: string;
  unitId: string;
  kpi: KpiNumber;
  activityKey: string;
  quadrant: StakeholderQuadrant;
  tanggal: string; // YYYY-MM-DD
  judul: string;
  keteranganKepentingan?: string;
  bulan: number; // 1-12
  tahun: number;
  jumlah: number;
  evidencePaths?: string[]; // path Firebase Storage (tanpa link eksternal)
  legacyEvidenceUrls?: string[]; // link GDrive warisan sheet (sebelum migrasi)
  status: ActivityStatus;
  asmanNote?: string | null;
  adminNote?: string | null;
  authorUid: string;
}

/* ------------------------------------------------------------------ */
/* Pengisian KPI 5 (Manage Closely + Keep Informed) & KPI 6 (Keep       */
/* Satisfied + Monitor) — pengganti sheet. TL mengisi satu entri per    */
/* kegiatan (judul format sheet + tanggal + pengaruh/kepentingan +      */
/* keterangan + bukti). Sistem menurunkan kuadran otomatis. JUMLAH      */
/* dihitung otomatis dari banyaknya entri (tidak diketik manual).      */
/* API Firestore (/api/stakeholder-activities) menyusul.                */
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

/** Daftar aktivitas per KPI resmi. */
export function kpiActivities(kpi: KpiNumber): KpiActivity[] {
  return KPI_ACTIVITIES.filter((a) => a.kpi === kpi);
}
/** KPI 5 = Manage Closely + Keep Informed. */
export function kpi5Activities(): KpiActivity[] {
  return kpiActivities(5);
}
/** KPI 6 = Keep Satisfied + Monitor. */
export function kpi6Activities(): KpiActivity[] {
  return kpiActivities(6);
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

/** Validasi draf entri untuk KPI target (default 6 agar form lama tetap jalan). */
export function validateEntryDraft(d: EntryDraft, targetKpi: KpiNumber = 6): string | null {
  if (!kpiActivities(targetKpi).some((a) => a.key === d.activityKey))
    return `Pilih jenis kegiatan KPI ${targetKpi}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal)) return "Tanggal tidak valid";
  if (d.judul.trim().length < 10) return "Judul kegiatan minimal 10 karakter";
  const fmtErr = validateJudulFormat(d.judul);
  if (fmtErr) return fmtErr;
  if (!d.pengaruh || !d.kepentingan)
    return "Pilih tingkat pengaruh dan kepentingan";
  if (d.keterangan.trim().length < 20)
    return "Keterangan minimal 20 karakter (agar tidak ditolak Asman)";
  const q = quadrantFor(d.pengaruh, d.kepentingan);
  if (kpiForQuadrantStrict(q) !== targetKpi)
    return `Kombinasi ini masuk kuadran ${q} (KPI ${kpiForQuadrantStrict(q)}). Halaman ini khusus KPI ${targetKpi}.`;
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
  const kpi = kpiForQuadrantStrict(quadrant);
  return {
    unitId: ctx.unitId,
    kpi,
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
