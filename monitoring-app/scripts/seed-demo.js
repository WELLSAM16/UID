// scripts/seed-demo.js
// ─────────────────────────────────────────────────────────────
// SEED DEMO (Admin UID): isi Firestore `offering-uid` dengan data contoh
// untuk preview ke calon klien — mencakup 6 KPI + set target.
//
//   KPI 1: skoring_targets (target skoring medsos 2026, Active)
//   KPI 2: medmas_entries (5 entri: approved/pending/draft)
//   KPI 3: evp_reports (4 laporan: approved/pending/draft)
//   KPI 4: pumk_visits (4 kunjungan: Inventarisasi/Penagihan)
//   KPI 5&6: stakeholders (5 data unit) + stakeholder_activities (8, se-alur
//            draft → pending_asman → acc_asman → pending_admin → approved)
//          + kpi_targets (8 target cluster A/B + cap per KPI)
//
// Semua dokumen demo ditandai { demo: true } + prefix "[DEMO]" agar:
//  - terlihat jelas sebagai contoh di preview, dan
//  - bisa dihapus massal via --cleanup tanpa menyentuh data asli.
//
// Cara pakai (dari folder monitoring-app):
//   node scripts/seed-demo.js --dry-run     (default: hanya tampilkan rencana)
//   node scripts/seed-demo.js --confirm     (TULIS ke Firestore)
//   node scripts/seed-demo.js --cleanup     (HAPUS semua dokumen demo:true)
//
// Kredensial dibaca dari monitoring-app/.env.local (FIREBASE_*). Script ini
// TIDAK di-push bersama secret apa pun. JANGAN jalankan ke project produksi
// aktif tanpa persetujuan — data demo bercampur di koleksi yang sama.

const { readFileSync } = require("fs");
const { join } = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DEMO_UID = "demo-admin-uid";
const DEMO_EMAIL = "demo@uidjaya.pln.co.id";
const NOW = new Date().toISOString();
const T = (s) => `2026-10-${s}`;

function loadEnv() {
  const envPath = join(__dirname, "..", ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const base = {
  authorUid: DEMO_UID,
  authorEmail: DEMO_EMAIL,
  createdAt: NOW,
  updatedAt: NOW,
  demo: true,
};

// ── KPI 1: target skoring ────────────────────────────────────
const skoringTargets = [
  {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    targetScore: 5000,
    targetPosts: 120,
    status: "Active",
    createdBy: DEMO_UID,
    createdByEmail: DEMO_EMAIL,
    createdAt: NOW,
    updatedAt: NOW,
    demo: true,
  },
];

// ── KPI 2: medmas ────────────────────────────────────────────
const medmasEntries = [
  { unitId: "UP3 BINTARO", tanggal: T("05"), outlet: "Kompas.com", judul: "[DEMO] PLN UID Jakarta Raya tambah 50 SPKLU di Tangsel", url: "https://example.com/berita/spklu-tangsel", tierMedia: "Nasional", skor: 85, status: "approved", submittedAt: T("06"), reviewedBy: DEMO_UID, reviewedAt: T("07"), reviewNote: "Sesuai kriteria." },
  { unitId: "UP3 BINTARO", tanggal: T("12"), outlet: "Detik.com", judul: "[DEMO] Electrifying lifestyle: warga Bintaro beralih kompor listrik", url: "https://example.com/berita/kompor-listrik", tierMedia: "Online", skor: 70, status: "approved", submittedAt: T("13"), reviewedBy: DEMO_UID, reviewedAt: T("14"), reviewNote: null },
  { unitId: "UP3 MENTENG", tanggal: T("15"), outlet: "Jakarta Post", judul: "[DEMO] PLN siagakan pasokan listrik HLN ke-80 di Gambir", url: "https://example.com/berita/siaga-hln", tierMedia: "Regional", skor: 60, status: "pending", submittedAt: T("16"), reviewedBy: null, reviewedAt: null, reviewNote: null },
  { unitId: "UP2D", tanggal: T("18"), outlet: "Info Lokal", judul: "[DEMO] Pemeliharaan gardu distribusi Cempaka Putih selesai", url: null, tierMedia: "Lokal", skor: 25, status: "draft", submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null },
  { unitId: "UP3 CIPUTAT", tanggal: T("20"), outlet: "Tribunnews", judul: "[DEMO] YBM PLN salurkan bantuan pendidikan di Ciputat", url: "https://example.com/berita/ybm-ciputat", tierMedia: "Online", skor: 55, status: "approved", submittedAt: T("21"), reviewedBy: DEMO_UID, reviewedAt: T("22"), reviewNote: null },
].map((e) => ({ ...base, ...e }));

// ── KPI 3: EVP ───────────────────────────────────────────────
const evpReports = [
  { unitId: "UP3 BINTARO", namaPegawai: "[DEMO] Andini Pratiwi", nip: "8801234A", noHp: "081234567890", unitAsal: "UP3 BINTARO", upDetail: "ULP Pondok Aren", kategoriProgram: "Pendidikan", namaProgram: "[DEMO] Cahaya Pintar Anak Tangsel", lokasiProvinsi: "Banten", lokasiKota: "Kota Tangerang Selatan", lokasiKecamatan: "Pondok Aren", lokasiKelurahan: "Perigi Baru", evidenUrl: null, tanggalPelaksanaan: T("10"), deskripsi: "[DEMO] Relawan mengajar literasi energi untuk 60 siswa SDN Perigi Baru.", status: "approved", submittedAt: T("11"), reviewedBy: DEMO_UID, reviewedAt: T("12"), reviewNote: null },
  { unitId: "UP3 MENTENG", namaPegawai: "[DEMO] Bagus Santoso", nip: "8805678B", noHp: "082345678901", unitAsal: "UP3 MENTENG", upDetail: "ULP Gambir", kategoriProgram: "Lingkungan", namaProgram: "[DEMO] Tanam 500 Mangrove Muara Karang", lokasiProvinsi: "DKI Jakarta", lokasiKota: "Kota Jakarta Utara", lokasiKecamatan: "Penjaringan", lokasiKelurahan: "Muara Karang", evidenUrl: null, tanggalPelaksanaan: T("14"), deskripsi: "[DEMO] Penanaman 500 bibit mangrove bersama komunitas nelayan.", status: "pending", submittedAt: T("15"), reviewedBy: null, reviewedAt: null, reviewNote: null },
  { unitId: "UP2D", namaPegawai: "[DEMO] Citra Lestari", nip: "8809012C", noHp: "083456789012", unitAsal: "UP2D", upDetail: "UP2D Jakarta", kategoriProgram: "Sosial", namaProgram: "[DEMO] Light Up The Dream 2026", lokasiProvinsi: "DKI Jakarta", lokasiKota: "Kota Jakarta Timur", lokasiKecamatan: "Cakung", lokasiKelurahan: "Ujung Menteng", evidenUrl: null, tanggalPelaksanaan: T("17"), deskripsi: "[DEMO] Penyambungan gratis untuk 12 keluarga prasejahtera.", status: "draft", submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null },
  { unitId: "UP3 CIPUTAT", namaPegawai: "[DEMO] Dedi Kurniawan", nip: "8813456D", noHp: "084567890123", unitAsal: "UP3 CIPUTAT", upDetail: "ULP Ciputat", kategoriProgram: "Kesehatan", namaProgram: "[DEMO] Donor Darah Peduli Sesama", lokasiProvinsi: "Banten", lokasiKota: "Kota Tangerang Selatan", lokasiKecamatan: "Ciputat", lokasiKelurahan: "Cipayung", evidenUrl: null, tanggalPelaksanaan: T("19"), deskripsi: "[DEMO] Donor darah massal: 85 kantong terkumpul dari pegawai dan warga.", status: "approved", submittedAt: T("20"), reviewedBy: DEMO_UID, reviewedAt: T("21"), reviewNote: null },
].map((e) => ({ ...base, ...e }));

// ── KPI 4: PUMK visits ───────────────────────────────────────
const pumkVisits = [
  { unitId: "UP3 BINTARO", tanggalKunjungan: T("06"), noId: "01-01-396/96", namaMitra: "[DEMO] Berkah Jaya Abadi", kolektibilitas: "Lancar", saldoPokok: 15000000, saldoJasa: 750000, totalSaldo: 15750000, jenisTindakLanjut: "Penagihan", buktiBayarUrl: "https://example.com/bukti/demo-bayar-1", lokasiUrl: null, kondisiMitra: null, formOUrl: null, dokumenLainUrl: null, status: "approved", submittedAt: T("07"), reviewedBy: DEMO_UID, reviewedAt: T("08"), reviewNote: null },
  { unitId: "UP3 BINTARO", tanggalKunjungan: T("11"), noId: "01-02-101/97", namaMitra: "[DEMO] Sinar Tani Makmur", kolektibilitas: "Masalah", saldoPokok: 8000000, saldoJasa: 400000, totalSaldo: 8400000, jenisTindakLanjut: "Inventarisasi", lokasiUrl: "https://maps.google.com/?q=-6.28,106.71", kondisiMitra: "Mitra Gagal Bayar", formOUrl: null, dokumenLainUrl: null, buktiBayarUrl: null, status: "pending", submittedAt: T("12"), reviewedBy: null, reviewedAt: null, reviewNote: null },
  { unitId: "UP3 MENTENG", tanggalKunjungan: T("13"), noId: "02-01-055/98", namaMitra: "[DEMO] Kopi Nusantara Raya", kolektibilitas: "Lancar", saldoPokok: 22000000, saldoJasa: 1100000, totalSaldo: 23100000, jenisTindakLanjut: "Penagihan", buktiBayarUrl: "https://example.com/bukti/demo-bayar-2", lokasiUrl: null, kondisiMitra: null, formOUrl: null, dokumenLainUrl: null, status: "approved", submittedAt: T("14"), reviewedBy: DEMO_UID, reviewedAt: T("15"), reviewNote: null },
  { unitId: "UP2D", tanggalKunjungan: T("16"), noId: "03-01-007/99", namaMitra: "[DEMO] Maju Bersama Craft", kolektibilitas: "Macet", saldoPokok: 5000000, saldoJasa: 250000, totalSaldo: 5250000, jenisTindakLanjut: "Inventarisasi", lokasiUrl: "https://maps.google.com/?q=-6.22,106.88", kondisiMitra: "Mitra Tidak Ditemukan", formOUrl: null, dokumenLainUrl: null, buktiBayarUrl: null, status: "draft", submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null },
].map((e) => ({ ...base, ...e }));

// ── KPI 5&6: stakeholders (20 kolom SPS) ─────────────────────
function sh(unitId, instansi, pimpinan, pic, quadrant, sikap) {
  return {
    ...base,
    unitId,
    instansi: `[DEMO] ${instansi}`,
    alamat: "[DEMO] Jl. Contoh Raya No. 1",
    namaPimpinan: pimpinan,
    telpKantor: "(021) 7000000",
    noHpPimpinan: null,
    tglUltahPimpinan: null,
    namaPic: pic,
    noHpPic: "081200000000 (PIC)",
    hutLembaga: "1 Januari 2000",
    isu: "[DEMO] Sinergi program kelistrikan",
    sikap,
    quadrant,
    tujuan: "[DEMO] Sinergi PPJ, percepatan cash in, dan edukasi program PLN.",
    metode: "Silaturahmi, audiensi",
    pelaksana: "MUP3, Asman SAR",
    waktu: "Oktober 2026",
    tarifDaya: "[DEMO] R-2/3500VA",
    pemeliharaan: null,
    mouPks: "Belum ada",
    kerjasamaAnak: "Tidak ada",
    nama: `[DEMO] ${instansi}`,
    jabatan: pimpinan,
  };
}
const stakeholders = [
  sh("UP3 BINTARO", "Walikota Tangerang Selatan", "Drs. H. Contoh Walikota", "Dedi", "Manage Closely", "PEMERINTAH"),
  sh("UP3 BINTARO", "Kapolres Tangerang Selatan", "Kombes Pol Contoh Kapolres", "Aldi", "Manage Closely", "KEPOLISIAN"),
  sh("UP3 MENTENG", "Camat Gambir", "Drs. Contoh Camat", "Sari", "Keep Informed", "PEMERINTAH"),
  sh("UP3 MENTENG", "Pemimpin Redaksi Harian Contoh", "Contoh Pemred", "Riko", "Monitor", "MEDIA"),
  sh("UP2D", "Dinas Perhubungan DKI", "Drs. Contoh Kadishub", "Wulan", "Keep Satisfied", "PEMERINTAH"),
];

// ── KPI 5&6: activities (satu dokumen = satu kegiatan) ───────
function act(unitId, kpi, activityKey, quadrant, tanggal, judul, keterangan, status) {
  return {
    ...base,
    unitId,
    kpi,
    activityKey,
    quadrant,
    tanggal,
    judul: `[DEMO] ${judul}`,
    keteranganKepentingan: keterangan,
    bulan: 10,
    tahun: 2026,
    jumlah: 1,
    evidencePlaceholders: [],
    status,
    asmanNote: status === "revisi_tl" ? "[DEMO] Lengkapi keterangan kepentingan." : null,
    adminNote: null,
  };
}
const stakeholderActivities = [
  act("UP3 BINTARO", 5, "audiensi", "Manage Closely", T("03"), "Walikota Tangsel_Silaturahmi PPJ_03102026", "[DEMO] Audiensi PPJ dan percepatan cash in rekening listrik.", "approved"),
  act("UP3 BINTARO", 5, "audiensi", "Manage Closely", T("08"), "Kapolres Tangsel_Koordinasi P2TL_08102026", "[DEMO] Koordinasi preventif P2TL wilayah Pondok Aren.", "pending_admin"),
  act("UP3 BINTARO", 5, "share_wag", "Keep Informed", T("09"), "WAG Pamong_Sosialisasi Tarif_09102026", "[DEMO] Share info penyesuaian tarif ke WAG pamong.", "acc_asman"),
  act("UP3 BINTARO", 5, "sosialisasi", "Keep Informed", T("15"), "Kecamatan Ciputat_Edukasi Kompor Listrik_15102026", "[DEMO] Sosialisasi kompor listrik ke 80 ibu PKK.", "pending_asman"),
  act("UP3 MENTENG", 6, "audiensi", "Keep Satisfied", T("04"), "Camat Gambir_Silaturahmi HUT_04102026", "[DEMO] Sapa personal HUT kecamatan dan sinergi penerangan jalan.", "approved"),
  act("UP3 MENTENG", 6, "sapa_personal", "Keep Satisfied", T("10"), "Redaksi Harian Contoh_Ucapan HUT_10102026", "[DEMO] Sapa personal HUT media mitra.", "draft"),
  act("UP3 MENTENG", 6, "share_wag", "Monitor", T("11"), "WAG Komunitas_Info Padam Terencana_11102026", "[DEMO] Share jadwal padam terencana ke WAG komunitas.", "pending_admin"),
  act("UP2D", 6, "influencer", "Monitor", T("12"), "Kreator Contoh_Konten Hemat Listrik_12102026", "[DEMO] Kerja sama konten hemat energi (link konten terlampir).", "pending_asman"),
];

// ── Target KPI 5&6 per cluster (sumber: paparan SM I & Progja SM II) ──
const kpiTargets = [
  { kpi: 5, activityKey: "audiensi", clusterA: 5, clusterB: 4, period: "bulanan", cap: 1.1 },
  { kpi: 5, activityKey: "event_bersama", clusterA: 3, clusterB: 2, period: "semesteran", cap: 1.1 },
  { kpi: 5, activityKey: "share_wag", clusterA: 7, clusterB: 5, period: "bulanan", cap: 1.1 },
  { kpi: 5, activityKey: "sosialisasi", clusterA: 6, clusterB: 3, period: "bulanan", cap: 1.1 },
  { kpi: 6, activityKey: "audiensi", clusterA: 5, clusterB: 3, period: "bulanan", cap: 1.0 },
  { kpi: 6, activityKey: "sapa_personal", clusterA: 7, clusterB: 5, period: "bulanan", cap: 1.0 },
  { kpi: 6, activityKey: "share_wag", clusterA: 7, clusterB: 5, period: "bulanan", cap: 1.0 },
  { kpi: 6, activityKey: "influencer", clusterA: 2, clusterB: 1, period: "semesteran", cap: 1.0 },
].map((t) => ({ ...base, ...t, level: 4, year: 2026 }));

const PLAN = [
  ["skoring_targets", skoringTargets],
  ["medmas_entries", medmasEntries],
  ["evp_reports", evpReports],
  ["pumk_visits", pumkVisits],
  ["stakeholders", stakeholders],
  ["stakeholder_activities", stakeholderActivities],
  ["kpi_targets", kpiTargets],
];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--confirm") && !args.includes("--cleanup");
  const cleanup = args.includes("--cleanup");

  const env = loadEnv();
  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.error("FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY belum diisi di .env.local");
    process.exit(1);
  }
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();
  console.log(`Project: ${projectId}`);

  if (cleanup) {
    let total = 0;
    for (const [col] of PLAN) {
      const snap = await db.collection(col).where("demo", "==", true).get();
      let n = 0;
      for (const d of snap.docs) {
        if (!dryRun) await d.ref.delete();
        n++;
      }
      console.log(`${dryRun ? "[DRY-RUN] hapus" : "dihapus"} ${col}: ${n}`);
      total += n;
    }
    console.log(`${dryRun ? "[DRY-RUN] T" : "T"}otal: ${total} dokumen demo.`);
    if (dryRun) console.log('Tambahkan --confirm untuk eksekusi, atau jalankan "--cleanup --confirm".');
    return;
  }

  // Cegah duplikasi: tolak bila sudah ada dokumen demo.
  for (const [col] of PLAN) {
    const snap = await db.collection(col).where("demo", "==", true).limit(1).get();
    if (!snap.empty) {
      console.error(`BATAL: koleksi ${col} sudah berisi data demo. Jalankan --cleanup dulu bila ingin mengulang.`);
      process.exit(1);
    }
  }

  let total = 0;
  for (const [col, docs] of PLAN) {
    console.log(`${dryRun ? "[DRY-RUN] tulis" : "menulis"} ${col}: ${docs.length} dokumen`);
    if (!dryRun) {
      for (const doc of docs) await db.collection(col).add(doc);
    }
    total += docs.length;
  }
  console.log(`${dryRun ? "[DRY-RUN] T" : "T"}otal: ${total} dokumen demo${dryRun ? " (tidak ada yang ditulis)." : "."}`);
  if (dryRun) console.log("Jalankan ulang dengan --confirm untuk menulis ke Firestore.");
}

main().catch((err) => {
  console.error("Gagal:", err.message);
  process.exit(1);
});
