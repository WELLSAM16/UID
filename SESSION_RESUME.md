# Resume Sesi — Pisah Repo UID + Firebase Baru (1 Okt 2026)

## Posisi terakhir
- Repo AKTIF: `D:\Magang\Magang` → GitHub `WELLSAM16/UID`, branch `master @ ef50530`, sinkron origin. Vercel project baru auto-deploy dari sini.
- Repo LAMA: `D:\Magang2\Magang` → `WELLSAM16/Magang5bulan`, beku di `fitur-pumk-monitoring @ 6971296`. Branch `tahap-1-fondasi-akun` + `fix-dashboard-desktop` SUDAH DIHAPUS (remote+lokal, isi ter-port ke UID). JANGAN push/merge apa pun ke repo lama. Production lama `6439f13` tidak tersentuh.
- Firebase AKTIF: `offering-uid` (akun baru). Cacat: `offering-ke-uid`, `uid-jaya` (akun lama, web key kena hold `API_KEY_INVALID`, abaikan/shutdown belakangan).

## Yang dikerjakan hari ini
1. Repo `UID` dari backup: commit awal `2d2cba4` (78 file, tanpa secrets).
2. `firebase.ts` env-driven (`NEXT_PUBLIC_FIREBASE_*`) — stop hardcoded project lama.
3. Port tahap-1 byte-identik (21 file, `cd5b3dc`): roles NIP+5 role, `/api/users`, `/admin/users`, `/ganti-password`, login NIP, `firebaseAuthAdmin` REST, rules baru, `make-admin` baru, fix dashboard desktop.
4. Fix bug `ganti-password` blank saat wajib ganti (`826cbc4`, prop `allowMustChangePassword`).
5. NIP PLN digit+huruf (`039711c`, lalu `cb14535` longgarkan 1-3 huruf akhir; cth `9213001ZDY`). Nama pegawai di Beranda + Sidebar.
6. Grup menu Administrator + halaman `/profil` (`3fed2a7`).
7. Bootstrap `offering-uid`: Firestore Jakarta, rules tahap-1 published, 8 `monitored_accounts` seed, `settings/keyword_categories` migrasi, admin `samuelsihombing160405@gmail.com` = administrator, sheet arsip share Editor ke SA baru.
8. Parkir ide di `NOTULENSI.md` seksi 7 (hapus permanen vs filter nonaktif).

## Env & secrets (TIDAK di repo, jangan commit)
- Lokal aktif: `D:\Magang\Magang\monitoring-app\.env.local` → `offering-uid`. Backup: `.env.local.offering-ke-uid`, `.env.local.old-project` (abaikan, gitignored).
- SA JSON: `Downloads\offering-uid-firebase-adminsdk-*.json` (aktif), `offering-ke-uid-*.json` + `monitoring-dashboard-11a1a-*.json` (arsip).
- Password sementara admin ada di chat sesi ini — GANTI via `/ganti-password` (belum dikonfirmasi terganti!).
- `CRON_SECRET` Vercel baru: nilai acak di chat sesi ini.

## Sisa / lanjut besok
1. Uji Staff dummy NIP → paksa ganti password → tolak `/admin/*` → hapus dummy. (pendig: hasil uji asman kemarin: ganti-password blank SUDAH FIX, uji ulang.)
2. Cron 01:00 WIB pertama → cek label "diperbarui".
3. Bersih: hapus 6 Preview Vercel project LAMA; shutdown `offering-ke-uid` + `uid-jaya`; hapus SA JSON arsip.
4. Tahap-2 (belum mulai): workflow press TL→Asman→Admin UID, `unitId` per akun IG.
