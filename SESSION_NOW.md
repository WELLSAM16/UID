# SESSION_NOW — status aktif (23 Okt 2026)

> Baca file ini saja saat membuka sesi baru. Detail historis: `SESSION_RESUME.md` (jangan dibaca penuh).

## Posisi sekarang
- Branch `feat-draft-internal-storage` @ `1b0170d`, sudah di-push. `origin/master` @ `2583441` (PR #14).
- **Belum ada PR baru** untuk fitur media. Langkah user:
  `https://github.com/WELLSAM16/UID/compare/master...feat-draft-internal-storage?expand=1`
  judul saran: "Media: unggah file ke penyimpanan internal (draf konten, press release, EVP, stakeholder)".
- Sudah live & terbukti di production: **PUMK kunjungan** (bukti uji 23 Okt di bawah).
- Belum live (menunggu merge): draf konten, draf press release, EVP, stakeholder realisasi.
- `tsc --noEmit` EXIT 0, `next build` EXIT 0 setelah tiap surface. Working tree: `M SESSION_RESUME.md`,
  `D NOTULENSI.md`, `?? monitoring-app/docs/` (jangan sentuh). `gh` CLI tidak ada → cek PR via API.

## Bukti uji produksi 23 Okt (PUMK kunjungan)
- Dokumen `pumk_visits/T9bqTNm0BjsUZk9NUl7W`, unit `uid`, status `draft`.
- `formOPath` 283.407 B (`%PDF-1.7`), `buktiBayarPath` 675.998 B (`%PDF-1.4`); keduanya `%%EOF` valid.
- Firestore cocok dengan disk (`createdAt 22:32:14`, `formOName`, `buktiBayarName` terisi; `dokumenLain` null).
- Log: `PUT 201` ×2 lalu `GET 200` (user membuka file). Unduh ulang via signed URL publik: 200, SHA-256
  sama dengan file lokal. `/health` = **4 file**. Artinya tulis + baca + Funnel + token semua sehat.

## Automasi storage PC (terverifikasi 23 Okt)
- Service Node tanpa dependensi: `D:\media-store\server.mjs`, `127.0.0.1:8787`; publik via **Tailscale Funnel**
  `https://wellsam.tail328a49.ts.net` (`/health`). Root data `D:\media-store\data`, log `D:\media-store\logs`
  (rotasi harian `YYYY-MM-DD.log`; `service.log` = stdout).
- Scheduled Task `MediaStore`: trigger **AtStartup**, principal **SYSTEM** (tanpa login), restart **999× / 1 mnt**,
  ExecutionTimeLimit 3650 hari, `StartWhenAvailable`. Aksi `cmd.exe /c D:\media-store\run.cmd`.
- `run.cmd` pakai `NODE_EXE` absolut (`C:\Program Files\nodejs\node.exe`) dari `config.env`; `cd /d %~dp0`.
- Service `Tailscale` = Automatic; Funnel on → proxy `/` ke `127.0.0.1:8787`. Sleep AC dimatikan.
- **Belum diuji reboot**: boot terakhir 20 Okt, task dipasang 22 Okt; service hidup sejak 22 Okt 09:28.
  `HiberbootEnabled=1` → "Restart" tetap boot penuh (aman); hanya "Shut down" + nyala yang bisa melewati
  trigger AtStartup. Verifikasi setelah restart: buka `/health` dari HP (data seluler) → `"ok": true`.
- Query task butuh admin (`Access is denied` dari shell biasa); bukti task aktif = parent process `svchost.exe`
  → `cmd.exe` → `node`.
- Auth: HMAC-SHA256 `MEDIA_SECRET` (64 hex, sama di Vercel + PC); token 15 menit `{o,p,e,s,t,n}`, PC hanya
  verifikasi tanda tangan. Browser PUT langsung ke PC (tak lewat batas 4.5 MB Vercel); Firestore simpan `path`.
- `MEDIA_ORIGIN` dikunci ke `https://uid-navy.vercel.app` (preview deployment tak bisa upload). Env Vercel:
  `MEDIA_BASE_URL`, `MEDIA_SECRET`. Tanpa login `upload-url` balas **401** (bukan 503) = sehat.
- Batas: PDF/JPG/PNG/WebP maks 10 MB; video ditolak; gambar dikompres di browser (1600 px, JPEG q .82).
- Path: `{prefix}/{unitId}/{yyyy}/{mm}/{docId}/{folder}/{timestamp}-{rand8}-{safename}`.
- Bukti immutable setelah submit (revisi = entri/file baru).
- `compat-test.mjs` (di `D:\media-store`) = 6/6 lulus; jalankan `node compat-test.mjs` untuk cek cepat
  (menulis lalu menghapus file uji 2 MB).

## Kode media di app
- `src/lib/mediaShared.ts` (`MediaTarget` + `index`, validasi, `nameFieldOf` `...Paths`→`...Names`),
  `mediaSign.ts`, `mediaRules.ts` (izin field/status per koleksi), `mediaClient.ts`
  (`uploadMediaFile`, `openMediaFile` — `token` boleh fungsi agar tab dibuka sebelum menunggu token).
- `src/app/api/files/upload-url/route.ts`, `download-url/route.ts` (mint token; dukung field array via `index`).
- `.env.local` berisi secret Firebase/SMTP, gitignored. Firestore ditulis via Admin SDK.

## Surface yang sudah tersambung
- PUMK kunjungan (live): `formOPath/Name`, `dokumenLainPath/Name`, `buktiBayarPath/Name`; submit Penagihan
  diblokir tanpa bukti.
- `dashboard/drafts` `f83aea0`: media + dokumen rencana; buat draf → unggah → PATCH; rollback bila gagal;
  tombol buka di tabel + `DraftDetailModal`.
- `press-release/drafts` `bc4ebd7`: alur sama + `PressDraftDetailModal`.
- `evp` `478ad2d`: eviden saat simpan draf; API simpan `evidenPath/Name`; kolom EVIDEN + tombol buka.
- `stakeholder/realisasi` `d35de48`/`af3ded2`/`daeeb28`: API `/api/stakeholder-activities` (GET/POST) +
  `/[id]` (PATCH `update|submit|transition`, DELETE); multi-bukti `evidencePaths[]`; "Kirim ke Asman" aktif;
  daftar "Kegiatan tersimpan" + buka bukti bertoken.

## Sisa pekerjaan
1. Buat PR → merge → deploy, lalu uji unggah 1 PDF + 1 gambar di 4 surface (draf konten, draf press release,
   EVP, stakeholder realisasi).
2. `stakeholder/review` masih MOCK → sambungkan ke API transisi yang ada.
3. Halaman edit EVP agar eviden bisa diganti selama draf.
4. Publish `firestore.rules` blok `pumk_targets` (Console); SMTP produksi; import cascading dari Sheet;
   rekap agregat PUMK lintas unit.
5. Keputusan tertunda: duplikat demo pakai data sama (A) atau Firebase project terpisah (B, rekomendasi);
   `NOTULENSI.md` restore atau hapus.

## Perintah & catatan
- tsc: `cd monitoring-app; node node_modules\typescript\bin\tsc --noEmit` (npx diblokir ExecutionPolicy).
- build: `node node_modules\next\dist\bin\next build`; lint: `node node_modules\eslint\bin\eslint.js`.
- Health: `Invoke-RestMethod https://wellsam.tail328a49.ts.net/health`.
- Chrome minta "Access other devices on your local network" (Funnel → `100.109.228.68`): pilih Allow.
- Bandwidth PC bukan hambatan (~340 Mbps down, ~325 Mbps up paralel). Repo lama `D:\Magang2\Magang` BEKU;
  Firebase aktif `offering-uid`; `master` lokal basi, acuan `origin/master`.
