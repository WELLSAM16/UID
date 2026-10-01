# Notulensi — Rencana UID Jaya & Tahap 1 Fondasi Akun

Tanggal: 30 Sep 2026. Branch: `tahap-1-fondasi-akun` (dari `master` via `fix-dashboard-desktop`).

## 1. Rencana besar (disimpan, belum dibangun)
- Web dipakai 1 pintu untuk UID Jaya: semua KPI kinerja KU dalam satu web.
- Workflow mirip seperti sekarang.

## 2. Keputusan role (final, sudah disepakati)
- 3 tingkat di UP3: **Staff → Team Leader → Asman**.
- 1 di UID: **Admin UID**.
- Di luar itu: **Administrator** (dev/maintenance, akses semua fitur 4 role).
- Login pakai **NIP** (dipetakan ke `<nip>@uidjaya.pln.co.id`); akun email khusus tetap bisa login (untuk administrator).
- Password pertama dibuat admin; user wajib ganti saat login pertama (`mustChangePassword`).
- Mutasi/nonaktif akun sepenuhnya kendali admin (soft delete, riwayat draf utuh).
- Registrasi publik **ditutup** (auto-create `user` dihapus).

## 3. Alur yang disepakati
- **Press release:** semua role UP3 bisa buat draf → review TL → Asman approve → antrean Admin UID → Admin UID memilih yang dirilis ke media. Dashboard Admin UID per unit + target di-set Admin UID.
- **Draf medsos:** DITUNDA, belum dirombak.
- Medsos: tiap UP3 monitoring metriknya sendiri; Admin UID melihat semua akun terdaftar per UP3 (butuh `unitId` per akun — tahap berikutnya).
- Pertanyaan terbuka: apakah TL/Asman boleh buat draf sendiri atau hanya Staff.

## 4. Tahap 1 — Fondasi akun & role (SUDAH DIKERJAKAN, sudah push)
1. Tutup registrasi publik.
2. Role baru + `unitId` + `nip` (`src/lib/roles.ts`).
3. Halaman `/admin/users` + API `/api/users` (daftar, tambah NIP + password awal, ubah role/unit, reset password, nonaktifkan). Admin UID hanya boleh kelola staff/TL/asman.
4. Halaman `/ganti-password` + blokir ProtectedRoute sampai password diganti.
5. Akun lama tetap bisa login (`admin`→administrator, `user`→staff).

## 5. Perbaikan deployment preview (riwayat error)
- `04d8d97` fix: guard API tanpa `return null` (validator route Next 16).
- `184f0f1` GAGAL: turunkan `jose` ke v5 — tidak mempan karena `jwks-rsa` memakai salinan v6 bersarang (`jwks-rsa/node_modules/jose`).
- `877d300` (terbaru): hapus `firebase-admin/auth` total → operasi Auth via Identity Toolkit REST (`src/lib/firebaseAuthAdmin.ts`). `scripts/make-admin.js` ikut diubah (cari UID via Firestore).
- PR dilakukan manual oleh owner. Preview memakai Firestore yang sama dengan production (akun uji terbawa).

## 6. Operasional (sudah diinstruksikan ke owner)
- `.env.local` tidak di-commit (gitignored); salin manual antar device + isi env Preview di Vercel.
- Deploy `firestore.rules` manual via `firebase deploy --only firestore:rules`.
- Bootstrap admin pertama: `node scripts/make-admin.js samuelsihombing160405@gmail.com administrator uid`.
- Urutan uji: NIP tak terdaftar ditolak → admin buat Staff → Staff dipaksa ganti password → role lain tidak bisa buka `/admin/*`.
