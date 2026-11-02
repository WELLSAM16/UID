/**
 * Monitoring PUMK — pembaca database mitra internal (`pumk_database`).
 *
 * Sebelumnya halaman Monitoring PUMK membaca Google Sheet (gviz). Sekarang
 * sumbernya Firestore `pumk_database`, sehingga konsisten dengan Database
 * PUMK dan Set Target. Tidak ada lagi permintaan ke Google Sheet.
 *
 * Satu dokumen database = satu mitra (NO ID). Field yang dipakai di sini
 * dipilih agar payload API tetap ringan.
 */

import type { Firestore } from "firebase-admin/firestore";
import { formatUnitDisplay } from "./roles";
import { PUMK_DB_COLLECTION, type PumkDatabaseMitra } from "./pumkDatabase";

export interface PumkMitra {
  id?: string;
  noId: string;
  nama: string;
  kolektibilitas: string;
  pks: string;
  pinjamanPokok: number;
  /** Saldo pokok Juli 2026. */
  pokokJul: number;
  /** Saldo jasa Juli 2026. */
  jasaJul: number;
  /** Pokok + jasa Juli 2026. */
  totalJul: number;
  tindakLanjut: string;
  lokasiUrl: string;
  alamat: string;
  status1: string;
  status2: string;
  masukTO: string;
  usulanTL: string;
  statusPerJuli: string;
  statusTLUP: string;
  nilaiTLUP: number;
  hasilInventarisasi: string;
  /** Unit penanggung jawab ("" = belum ditugaskan). */
  unitId: string;
  sektorUsaha: string;
  linkFolder: string;
}

export interface PumkKpi {
  totalMitra: number;
  totalTunggakan: number;
  byKolektibilitas: { name: string; count: number; rupiah: number }[];
  selesai: number;
  berjalan: number;
  belumMulai: number;
  toCount: number;
  pksKosong: number;
}

export interface PumkUnitCount {
  /** "" untuk mitra yang belum punya unit. */
  unitId: string;
  label: string;
  count: number;
}

/** Field `pumk_database` yang dibaca untuk monitoring. */
export const PUMK_MONITORING_FIELDS = [
  "noId",
  "nama",
  "kolektibilitas",
  "pks",
  "pinjamanPokok",
  "saldoPokokJuli",
  "saldoJasaJuli",
  "totalSaldoJuli",
  "usulanTLTO2026",
  "usulanTLTO2026Default",
  "tindakLanjutInventarisasiUP",
  "mapsUrl",
  "alamat",
  "validasi1",
  "validasi2",
  "masukTO2026",
  "statusPerJuli",
  "statusTLUPSM1",
  "nilaiTLUPSM1",
  "hasilInventarisasiUP",
  "unitId",
  "sektorUsaha",
  "linkFolder",
] as const;

const str = (value: unknown): string => String(value ?? "").trim();
const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** Ambil nilai pertama yang tidak kosong. */
function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = str(value);
    if (text && text !== "#N/A" && text.toUpperCase() !== "NONE") return text;
  }
  return "";
}

/** Dokumen `pumk_database` → bentuk yang dipakai halaman Monitoring PUMK. */
export function mapPumkDbRow(row: PumkDatabaseMitra & { id?: string }): PumkMitra {
  const pokokJul = num(row.saldoPokokJuli);
  const jasaJul = num(row.saldoJasaJuli);
  const totalJul = num(row.totalSaldoJuli) || pokokJul + jasaJul;
  const tindakLanjut =
    firstText(
      row.usulanTLTO2026,
      row.usulanTLTO2026Default,
      row.tindakLanjutInventarisasiUP
    ) || "-";

  return {
    id: row.id,
    noId: str(row.noId),
    nama: str(row.nama) || "(tanpa nama)",
    kolektibilitas: str(row.kolektibilitas) || "-",
    pks: str(row.pks) || "-",
    pinjamanPokok: num(row.pinjamanPokok),
    pokokJul,
    jasaJul,
    totalJul,
    tindakLanjut,
    lokasiUrl: str(row.mapsUrl),
    alamat: str(row.alamat),
    status1: str(row.validasi1),
    status2: str(row.validasi2),
    masukTO: str(row.masukTO2026),
    usulanTL: str(row.usulanTLTO2026),
    statusPerJuli: str(row.statusPerJuli),
    statusTLUP: str(row.statusTLUPSM1),
    nilaiTLUP: num(row.nilaiTLUPSM1),
    hasilInventarisasi: str(row.hasilInventarisasiUP),
    unitId: str(row.unitId),
    sektorUsaha: str(row.sektorUsaha),
    linkFolder: str(row.linkFolder),
  };
}

/** Baca seluruh mitra dari `pumk_database` (field minimum). */
export async function readPumkMonitoring(db: Firestore): Promise<PumkMitra[]> {
  const snap = await db
    .collection(PUMK_DB_COLLECTION)
    .select(...PUMK_MONITORING_FIELDS)
    .get();

  return snap.docs
    .map((doc) =>
      mapPumkDbRow({ id: doc.id, ...(doc.data() as PumkDatabaseMitra) })
    )
    .filter((m) => m.noId)
    .sort(
      (a, b) =>
        b.totalJul - a.totalJul ||
        a.noId.localeCompare(b.noId, "id", { numeric: true, sensitivity: "base" })
    );
}

const DONE_TL = [
  "SUDAH HAPUS BUKU",
  "LUNAS",
  "SELESAI INVENTARISASI",
  "SELESAI",
];

/**
 * Progres tindak lanjut berdasarkan hasil/keputusan TL:
 * - selesai : sudah hapus buku / lunas / selesai inventarisasi
 * - berjalan: ada rencana TL (inventarisasi, penagihan, mutasi, dst.)
 * - belum   : bukan TO 2026 / belum ada rencana
 */
export function tlProgress(m: PumkMitra): "selesai" | "berjalan" | "belum" {
  const tl = m.tindakLanjut.trim().toUpperCase();
  if (!tl || tl === "-" || tl === "BUKAN TO 2026" || tl === "#N/A") {
    return "belum";
  }
  if (DONE_TL.some((done) => tl.includes(done))) return "selesai";
  return "berjalan";
}

/** KPI dihitung dari daftar mitra yang sudah difilter (scope unit). */
export function buildPumkKpi(list: PumkMitra[]): PumkKpi {
  const byKol = new Map<string, { count: number; rupiah: number }>();
  let selesai = 0;
  let berjalan = 0;
  let belumMulai = 0;
  let toCount = 0;
  let pksKosong = 0;
  let totalTunggakan = 0;

  for (const m of list) {
    totalTunggakan += m.totalJul;

    const kol =
      m.kolektibilitas && m.kolektibilitas !== "-"
        ? m.kolektibilitas
        : "Belum diisi";
    const slot = byKol.get(kol) || { count: 0, rupiah: 0 };
    slot.count += 1;
    slot.rupiah += m.totalJul;
    byKol.set(kol, slot);

    const progress = tlProgress(m);
    if (progress === "selesai") selesai += 1;
    else if (progress === "berjalan") berjalan += 1;
    else belumMulai += 1;

    if (m.masukTO.toUpperCase() === "TO 2026") toCount += 1;
    if (m.pks.trim().toUpperCase() !== "ADA") pksKosong += 1;
  }

  return {
    totalMitra: list.length,
    totalTunggakan,
    byKolektibilitas: [...byKol.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.rupiah - a.rupiah || a.name.localeCompare(b.name)),
    selesai,
    berjalan,
    belumMulai,
    toCount,
    pksKosong,
  };
}

/** Daftar unit + jumlah mitra, untuk filter Admin UID. */
export function countPumkByUnit(list: PumkMitra[]): PumkUnitCount[] {
  const map = new Map<string, number>();
  for (const m of list) {
    const key = m.unitId || "";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([unitId, count]) => ({
      unitId,
      label: unitId ? formatUnitDisplay(unitId) : "Belum ditugaskan",
      count,
    }))
    .sort((a, b) => {
      if (!a.unitId) return 1;
      if (!b.unitId) return -1;
      return a.label.localeCompare(b.label, "id");
    });
}
