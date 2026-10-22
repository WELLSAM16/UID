# SESSION_NOW — ringkasan aktif (update 21 Okt 2026)

> Cara pakai: **baca file ini saja** saat membuka sesi baru. Log lengkap ada di
> `SESSION_RESUME.md` (jangan dibaca penuh kecuali perlu detail historis).

## Update 22 Okt 2026 — media store PC (aktif)
- **Keputusan**: Firebase Storage tidak bisa dipakai di paket Spark (wajib Blaze sejak 3 Feb 2026).
  Media disimpan di **PC sendiri**, bukan R2/Blaze.
- Layanan PC: `D:\media-store\server.mjs` (Node, tanpa dependensi), port `8787`, diekspos lewat
  **Tailscale Funnel** `https://wellsam.tail328a49.ts.net` (tanpa port forwarding/domain).
- Auto-start: Scheduled Task `MediaStore` (SYSTEM). Bukti sehat: `curl https://wellsam.tail328a49.ts.net/health`.
- Auth jembatan: HMAC-SHA256 `MEDIA_SECRET` (64 hex) di Vercel + PC; token 15 menit `{o,p,e,s,t,n}`.
  PC hanya verifikasi tanda tangan, tidak menyimpan user DB.
- App: `src/lib/media{Shared,Sign,Rules,Client}.ts`, `/api/files/upload-url`, `/api/files/download-url`.
  Browser **PUT langsung ke PC** (tidak lewat Vercel 4.5 MB), lalu `path` disimpan di Firestore.
- **Pilot PUMK kunjungan selesai**: field `formOPath/Name`, `dokumenLainPath/Name`, `buktiBayarPath/Name`;
  upload saat simpan draf + aksi "Lampirkan file" selama draf; submit Penagihan diblokir tanpa bukti;
  file tidak bisa diubah setelah diajukan (revisi = laporan baru).
- Uji: roundtrip PUB→GET→DELETE via Funnel byte-identik; `tsc --noEmit` EXIT 0; `next build` EXIT 0.
- **Status 22 Okt sore**: commit `2c20332` (media) sudah di-push; user merge ke `master`; production
  `https://uid-navy.vercel.app` live. Verifikasi: `/api/files/upload-url` & `/download-url` balas **401**
  tanpa login (artinya `MEDIA_BASE_URL` + `MEDIA_SECRET` terbaca, bukan 503).
  `MEDIA_ORIGIN` sudah dikunci ke `https://uid-navy.vercel.app` (bukan `*`), service direstart.
- **Sisa**: (a) uji unggah dari browser oleh user (PUMK sudah terbukti end-to-end di production; surface
  lain belum diuji manual); (b) semua surface sudah disambungkan di branch (lihat di bawah), menunggu merge
  user ke `master`.

## Update 22 Okt 2026 — surface media (selesai di branch)
- `dashboard/drafts` (commit `f83aea0`): media + dokumen rencana; buat draf → unggah → PATCH path/nama;
  rollback draf baru bila unggah gagal; tombol "Buka" di tabel + `DraftDetailModal`.
- `press-release/drafts` (commit `bc4ebd7`): media press release alur yang sama + `PressDraftDetailModal`.
- `evp` (commit `478ad2d`): eviden diunggah saat simpan draf; kolom EVIDEN + tombol buka; API
  `evp-reports` kini menyimpan `evidenPath`/`evidenName`.
- `stakeholder/realisasi` (commit `d35de48`): API baru `/api/stakeholder-activities` (POST/GET) +
  `/[id]` (PATCH `update|submit|transition`, DELETE); unggah bukti banyak file ke `evidencePaths[]`;
  tombol "Kirim ke Asman" aktif (bukan lagi pratinjau JSON); `buildActivityPayload` diperbaiki.
- `mediaClient.openMediaFile` menerima `token` berupa fungsi `getToken` agar tab dibuka sebelum menunggu
  token (tidak diblokir popup).

## Status repo (verifikasi terakhir 21 Okt)
- Branch `feat-draft-internal-storage` @ `1ab21b2`; `origin/master` @ `2583441` (PR #14 merged 12 Okt).
- `git diff feat-draft-internal-storage origin/master` = kosong. Tidak ada kerja belum ter-merge.
- Tidak ada commit baru sejak 12 Okt. `tsc --noEmit` EXIT 0.
- Working tree: `M SESSION_RESUME.md`, `D NOTULENSI.md` (belum diputuskan), `?? monitoring-app/docs/` (jangan sentuh).
- `master` lokal basi (`644e973`); acuan = `origin/master`.
- Repo lama `D:\Magang2\Magang` BEKU. Firebase aktif: `offering-uid`.
- Perintah tsc (npx diblokir ExecutionPolicy): `cd monitoring-app; node node_modules\typescript\bin\tsc --noEmit`.

## Temuan kode (media/bukti)
- **Upload aktif** untuk PUMK kunjungan, draf konten, draf press release, EVP, dan stakeholder realisasi
  (semua lewat `mediaClient` → PC). `lib/storage.ts` tinggal jalur lama (tidak dipakai form baru).
- Batas file: PDF/JPG/PNG/WebP maks **10 MB**, video ditolak; gambar diperkecil di browser (1600 px, q .82).
- `stakeholder/review` + `evaluasi` masih MOCK (belum baca `/api/stakeholder-activities`).
- Path media: `{prefix}/{unitId}/{yyyy}/{mm}/{docId}/{folder}/{timestamp}-{rand}-{nama}`; koleksi
  `stakeholder_activities` memakai field logis `evidencePaths` (satu field, banyak file).

## Rencana upload media (disepakati arah, BELUM dikerjakan)
Prinsip: media tak lewat API (limit Vercel 4.5 MB); file di Storage, metadata di DB; simpan `path` bukan URL;
upload 2 tahap (draft → upload → PATCH); bukti immutable setelah submit (revisi = versi baru).
Path usulan: `stakeholder-activities/{unitId}/{tahun}/{bulan}/{activityId}/v{n}/{file}`.
Bacaan reviewer: signed URL 15 menit via Admin SDK (bukan `getDownloadURL` permanen).
Matriks: staff tulis saat draft/revisi; TL & Asman baca se-unit; Admin UID semua unit; hapus = soft delete.
Tahapan: 0 keputusan → 1 `storage.ts` generik → 2 rules+CORS → 3 pilot PUMK kunjungan → 4 API stakeholder
→ 5 UI review (ganti MOCK) → 6 pembersih file yatim/kuota → 7 uji peran.
Estimasi: tahap 1–3 ±1–2 hari; tahap 4–5 ±4–7 hari.

## Analisis "PC jadi server/duplikat"
Spec PC: Ryzen 7 7700 (8C/16T), RAM 31 GB, C: 99 GB bebas, D: 438 GB bebas, Win11 Pro, Node 24, LAN 2.5 GbE, **Tailscale terpasang**.
Bandwidth (ukur ulang 21 Okt, curl): download 1 koneksi 42,5 MB/s (~340 Mbps); upload 1 koneksi 14,9 MB/s (~119 Mbps);
upload 4 paralel 40,6 MB/s (~325 Mbps); Ookla 408/427 Mbps, ping 4 ms.
→ Angka "19 Mbps" di catatan lama SALAH (artefak `Invoke-WebRequest` PowerShell, 10 MB, 1 koneksi). **Bandwidth bukan hambatan.**

Tiga bentuk duplikat:
- **A. App sama + Firebase sama** (~30 mnt): cadangan demo, data produksi ikut → berisiko.
- **B. App sama + Firebase project terpisah** (~1–2 jam + seed): **rekomendasi untuk demo**, produksi aman.
- **C. App + DB lokal** (emulator/Postgres): 1–2 minggu, bukan duplikat lagi melainkan aplikasi kembar.
Kendala tersisa untuk PC: uptime/listrik, backup, IP dinamis (Tailscale Serve menyelesaikan), ToS ISP rumahan,
dan refactor 31 route + 23 `lib` (hanya untuk opsi C). Auth Firebase **tetap cloud** di semua opsi.

## Keputusan tertunda (tanya owner dulu)
1. ~~Video ikut demo sekarang, atau gambar/PDF dulu?~~ → **PDF/gambar dulu, video tidak didukung.**
2. ~~Media: Firebase Storage vs Cloudflare R2?~~ → **PC sendiri (Funnel), tanpa biaya.**
3. ~~Pilot pertama: PUMK kunjungan atau stakeholder realisasi?~~ → **PUMK kunjungan (selesai).**
4. Duplikat: data sama (A) atau data demo sendiri (B)?
5. `NOTULENSI.md`: restore atau hapus resmi?

## Sisa lama
Publish `firestore.rules` blok `pumk_targets` (Console, belum dikonfirmasi); SMTP produksi; uji e2e;
import cascading dari Sheet; rekap agregat PUMK lintas unit.
