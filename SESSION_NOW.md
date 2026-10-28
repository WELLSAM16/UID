# SESSION_NOW — status aktif (28 Okt 2026)

> Baca file ini saja saat membuka sesi baru. Detail historis: `SESSION_RESUME.md` (jangan dibaca penuh).

## Posisi sekarang
- Branch `feat-draft-internal-storage` @ `08a0319`, sudah di-push. `origin/master` @ `34f15fd`
  (merge PR #19; seluruh surface media sudah live).
- **Empat commit belum di-merge**: `72177b9` (target massal) + `9736300` (banyak NO ID per unit) +
  `03089d6` (Database PUMK internal) + `08a0319` (menu Database PUMK pindah ke dropdown PUMK). Langkah user:
  `https://github.com/WELLSAM16/UID/compare/master...feat-draft-internal-storage?expand=1`
  judul saran: "PUMK: target massal, banyak mitra/unit, database internal".
- Sudah live & terbukti di production: **PUMK kunjungan** (bukti uji 23 Okt di bawah) + seluruh
  surface media (draf konten, draf press release, EVP, stakeholder realisasi) via PR #18/#19.
- `tsc --noEmit` EXIT 0, `eslint` file terkait EXIT 0 (hanya warning `<img>` lama di Sidebar),
  `next build` EXIT 0 (28 Okt, termasuk setelah `08a0319`). Working tree: `M SESSION_RESUME.md`,
  `D NOTULENSI.md`, `?? monitoring-app/docs/` (jangan sentuh). `gh` CLI tidak ada → cek PR via API.

## Sesi 26–28 Okt — target PUMK massal (`72177b9` + `9736300`)
- Endpoint `POST /api/pumk-targets/bulk` (admin, satu transaksi Firestore, maks 17 unit):
  upsert per `(unitId, tahun)`, `overwrite:false` untuk melewati target lama, unit UID ditolak,
  duplikat/negatif/tahun salah ditolak 400. `assignedNoIds` bisa banyak per unit; daftar diganti
  bila dikirim, dipertahankan bila tidak. `createdAt` lama tetap; baris `Paused` diaktifkan kembali
  tanpa membuat duplikat.
- UI `/pumk/target` → Set Target: cakupan **satu unit / semua unit / pilih unit**. **Tidak ada bagi
  rata.** Tiap baris punya kolom daftar NO ID mitra (banyak, satu per baris atau pisah koma);
  target mitra otomatis mengikuti jumlah NO ID bila belum diubah manual. Kolom kosong mempertahankan
  daftar lama. Isi cepat hanya untuk inventarisasi & rupiah. Status `Baru/Diperbarui/Dilewati`.
  Halaman otomatis pindah ke tahun yang disimpan.
- Uji API **23/23 PASS**: 17/17 alur dasar (create/overwrite/skip/partial/Paused/validasi/2026 utuh)
  + 6/6 khusus NO ID (simpan banyak ID string newline+koma, ganti daftar, pertahankan bila field
  tidak dikirim, skip, tolak ID >120 karakter, 2026 utuh). Data uji 2097/2098/2099 sudah dihapus.
- **Belum**: uji klik manual UI di browser (environment ini tidak punya browser otomasi).
  Setelah merge, coba sekali mode Semua unit + Pilih unit di production.

## Sesi 28 Okt — Database PUMK internal (`03089d6`)
- Submenu **PUMK → Database PUMK** (`/admin/pumk-database`, ikon 🗄️), hanya admin_uid + super admin.
  Awalnya ditaruh di section Administrator, lalu dipindah ke dropdown PUMK pada `08a0319` karena user
  tidak menemukannya. Filter sidebar `allowedRoles: ["admin_uid"]`; administrator/admin selalu lolos,
  jadi staff/TL/asman tidak melihat menunya. Section Administrator kini hanya Kelola Pengguna.
- Akses langsung tetap terkunci: halaman di bawah layout admin (`ProtectedRoute requireAdmin`) dan semua
  API `pumk/database` memakai `requireAdmin` server-side → role unit ditolak 403 walau tahu URL.
  Halaman sengaja tetap di `/admin/pumk-database` agar guard admin tidak hilang.
- Catatan production: `origin/master` belum punya `admin/pumk-database` maupun `api/pumk/database`,
  jadi menu hanya ada di build branch. Setelah merge + deploy, buka **PUMK → Database PUMK**.
- Koleksi Firestore baru `pumk_database`: **363 mitra** hasil impor awal dari tab
  `FIX REKAP DATABASE MASTER`; **362 folder PKS/piutang** terisi, **266 unit** terisi,
  **97 belum punya unit**. Dokumen menyimpan field mirip sheet (identitas, keuangan, penugasan,
  status/validasi, lokasi) + `linkFolder` hasil ekstrak formula HYPERLINK.
- API admin: `GET/POST /api/pumk/database`, `PATCH/DELETE /api/pumk/database/[id]`.
  Validasi: NO ID unik (case-insensitive), nama wajib, angka >= 0, URL folder/maps valid,
  unit dinormalisasi (`UP2D Jakarta` → `UP2D`), role unit ditolak 403.
- UI: tabel + cari/filter unit/kolektibilitas/status + pagination + export Excel; form tambah/edit
  lengkap; tombol buka folder PKS/piutang. Tidak ada tautan ke Google Sheet dari halaman ini.
- Tautan **SPS Online/Google Sheet** di Monitoring PUMK + detail modal dihapus. Monitoring PUMK lama
  masih membaca sheet di server; sumber database baru sudah internal (migrasi monitoring bisa menyusul).
- Uji API **12/12 PASS**: 401 tanpa token, 403 role unit, 200 admin_uid, 363 mitra + folder sample,
  normalisasi UP2D, create, duplikat 409, URL salah 400, patch, bentrok NO ID 409, GET terbaru,
  delete + total kembali 363. Data uji dibersihkan.
- **Belum**: uji klik UI di browser dan uji input folder manual oleh user.

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
- Status 26 Okt: `/health` ok, **6 file**, uptime ±4,4 hari (380.204 dtk), 434 GB bebas; Funnel aktif.
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
1. Buat PR → merge `72177b9` + `9736300` + `03089d6` + `08a0319`, lalu uji klik UI target massal
   (banyak NO ID per unit, Semua unit + Pilih unit) dan Database PUMK di production; pastikan menu
   **PUMK → Database PUMK** hanya tampil untuk Admin UID/super admin.
2. Uji unggah 1 PDF + 1 gambar di 4 surface production (draf konten, draf press release, EVP,
   stakeholder realisasi) — kode sudah live via PR #18/#19.
3. `stakeholder/review` + `evaluasi` masih MOCK → sambungkan ke API transisi yang ada.
4. Halaman edit EVP agar eviden bisa diganti selama draf.
5. Publish `firestore.rules` blok `pumk_targets` + `pumk_database` (Console); SMTP produksi; migrasi
   Monitoring PUMK lama agar membaca `pumk_database` (bukan sheet); rekap agregat PUMK lintas unit.
6. Keputusan tertunda: duplikat demo pakai data sama (A) atau Firebase project terpisah (B, rekomendasi);
   `NOTULENSI.md` restore atau hapus.

## Perintah & catatan
- tsc: `cd monitoring-app; node node_modules\typescript\bin\tsc --noEmit` (npx diblokir ExecutionPolicy).
- build: `node node_modules\next\dist\bin\next build`; lint: `node node_modules\eslint\bin\eslint.js`.
- Health: `Invoke-RestMethod https://wellsam.tail328a49.ts.net/health`.
- Chrome minta "Access other devices on your local network" (Funnel → `100.109.228.68`): pilih Allow.
- Bandwidth PC bukan hambatan (~340 Mbps down, ~325 Mbps up paralel). Repo lama `D:\Magang2\Magang` BEKU;
  Firebase aktif `offering-uid`; `master` lokal basi, acuan `origin/master`.
