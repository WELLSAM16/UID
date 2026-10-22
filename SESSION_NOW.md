# SESSION_NOW — status aktif (22 Okt 2026)

> Baca file ini saja saat membuka sesi baru. Detail historis: `SESSION_RESUME.md` (jangan dibaca penuh).

## Posisi sekarang
- Branch `feat-draft-internal-storage` @ `8285f5d`, sudah di-push. `origin/master` @ `2583441` (PR #14).
- **Belum ada PR baru** untuk commit media. Langkah user berikutnya:
  `https://github.com/WELLSAM16/UID/compare/master...feat-draft-internal-storage?expand=1`
  judul saran: "Media: unggah file ke penyimpanan internal (draf konten, press release, EVP, stakeholder)".
- Setelah merge + deploy: uji manual unggah 1 PDF + 1 gambar di 4 surface (draf konten, draf press
  release, EVP, stakeholder realisasi). PUMK kunjungan sudah terbukti end-to-end di production.
- `tsc --noEmit` EXIT 0, `next build` EXIT 0 (dicek setelah tiap surface).
- Working tree: `M SESSION_RESUME.md`, `D NOTULENSI.md`, `?? monitoring-app/docs/` (jangan sentuh).
- `gh` CLI tidak ada; cek PR pakai GitHub API `Invoke-RestMethod`.

## Media store di PC (aktif, tanpa biaya)
- Firebase Storage tidak bisa di Spark (wajib Blaze) → file disimpan di PC sendiri.
- Service: `D:\media-store\server.mjs` (Node, tanpa dependensi), `127.0.0.1:8787`, publik via
  **Tailscale Funnel** `https://wellsam.tail328a49.ts.net` (health: `/health`).
- Auto-start: Scheduled Task `MediaStore` (SYSTEM). File pendukung: `token.mjs`, `mint.mjs`,
  `selftest.mjs` (16/16), `compat-test.mjs` (6/6), `run.cmd`, `config.env` (**jangan bocorkan**),
  `install-task.ps1`.
- Auth: HMAC-SHA256 `MEDIA_SECRET` (64 hex, sama di Vercel + PC). Token 15 menit
  `base64url(JSON).base64url(HMAC)`, klaim `{o,p,e,s,t,n}`; PC hanya verifikasi tanda tangan.
- Browser **PUT langsung ke PC** (tak lewat Vercel 4.5 MB); Firestore menyimpan `path`, bukan URL;
  baca via signed URL 15 menit. `MEDIA_ORIGIN` dikunci persis ke `https://uid-navy.vercel.app`
  (preview deployment tidak bisa upload).
- Path: `{prefix}/{unitId}/{yyyy}/{mm}/{docId}/{folder}/{timestamp}-{rand8}-{safename}`.
- Batas: PDF/JPG/PNG/WebP maks 10 MB; video ditolak; gambar diperkecil di browser (1600 px, JPEG q .82).
- Bukti immutable setelah submit (revisi = entri/file baru).

## Kode media di app
- `src/lib/mediaShared.ts` (`MediaTarget` termasuk `index`, validasi, `nameFieldOf` memetakan
  `...Paths`→`...Names`), `mediaSign.ts`, `mediaRules.ts` (izin field/status per koleksi),
  `mediaClient.ts` (`uploadMediaFile`, `openMediaFile` — `token` boleh fungsi agar tab dibuka dulu,
  tidak diblokir popup).
- `src/app/api/files/upload-url/route.ts` + `download-url/route.ts` (mint token; `download-url`
  mendukung field array via `index`).
- Env Vercel: `MEDIA_BASE_URL`, `MEDIA_SECRET`. Tanpa login API balas **401** (bukan 503) = sehat.
- `.env.local` berisi secret Firebase/SMTP, gitignored. Firestore ditulis via Admin SDK.

## Surface yang sudah tersambung (semua di branch)
- PUMK kunjungan (pilot, sudah merged & live): `formOPath/Name`, `dokumenLainPath/Name`,
  `buktiBayarPath/Name`; submit Penagihan diblokir tanpa bukti.
- `dashboard/drafts` `f83aea0`: media + dokumen rencana; buat draf → unggah → PATCH path/nama;
  rollback bila unggah gagal; tombol buka di tabel + `DraftDetailModal`.
- `press-release/drafts` `bc4ebd7`: alur sama + `PressDraftDetailModal`.
- `evp` `478ad2d`: eviden saat simpan draf; API simpan `evidenPath/Name`; kolom EVIDEN + tombol buka.
- `stakeholder/realisasi` `d35de48`/`af3ded2`/`daeeb28`: API `/api/stakeholder-activities`
  (GET/POST) + `/[id]` (PATCH `update|submit|transition`, DELETE); multi-bukti `evidencePaths[]`;
  "Kirim ke Asman" aktif; daftar "Kegiatan tersimpan" dari server + buka bukti bertoken.

## Sisa pekerjaan (opsional / lain)
1. `stakeholder/review` masih MOCK → sambungkan ke API transisi yang sudah ada.
2. Halaman edit EVP agar eviden bisa diganti selama draf.
3. Publish `firestore.rules` blok `pumk_targets` (Console); SMTP produksi; import cascading dari
   Sheet; rekap agregat PUMK lintas unit.
4. Keputusan tertunda: duplikat demo pakai data sama (A) atau Firebase project terpisah (B,
   rekomendasi); `NOTULENSI.md` restore atau hapus.

## Perintah & catatan
- tsc: `cd monitoring-app; node node_modules\typescript\bin\tsc --noEmit` (npx diblokir ExecutionPolicy).
- build: `node node_modules\next\dist\bin\next build`; lint: `node node_modules\eslint\bin\eslint.js`.
- Chrome minta "Access other devices on your local network" (Funnel → `100.109.228.68`): pilih Allow.
- Bandwidth PC bukan hambatan: ~340 Mbps down, ~325 Mbps up paralel (ukur 21 Okt).
- Repo lama `D:\Magang2\Magang` BEKU; Firebase aktif `offering-uid`; `master` lokal basi, acuan `origin/master`.
