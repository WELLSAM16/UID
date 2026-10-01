// scripts/make-admin.js
// ─────────────────────────
// Kelola role user via Admin SDK (bypass Firestore rules) — Tahap 1.
// Mendukung role baru UID Jaya + akun NIP.
//
// Cara pakai:
//   node scripts/make-admin.js <email|NIP> [staff|team_leader|asman|admin_uid|administrator|admin|user] [unitId]
//   node scripts/make-admin.js 12345678 administrator uid
//   node scripts/make-admin.js suwito@gmail.com admin
//
// Lookup user by email via Auth, lalu set users/{uid} { role, email, ... }.

const { readFileSync } = require("fs");
const { join } = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
// SENGAJA tidak memakai firebase-admin/auth: modul itu menarik jwks-rsa yang
// me-require jose v6 (ESM-only) → ERR_REQUIRE_ESM. UID dicari via Firestore
// (koleksi users), yang adalah sumber kebenaran role di sistem ini.

const NIP_EMAIL_DOMAIN = "uidjaya.pln.co.id";
const VALID_ROLES = ["staff", "team_leader", "asman", "admin_uid", "administrator", "admin", "user"];

function loadEnv() {
  const envPath = join(__dirname, "..", ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function toEmail(input) {
  // NIP PLN (digit + opsional 1-2 huruf akhir) -> petakan ke email internal.
  if (/^[0-9]{4,32}[A-Za-z]{0,3}$/.test(input)) return `${input.toUpperCase()}@${NIP_EMAIL_DOMAIN}`;
  return input;
}

async function main() {
  const input = process.argv[2];
  const role = process.argv[3] || "administrator";
  const unitId = process.argv[4] || null;
  if (!input) {
    console.error("Usage: node scripts/make-admin.js <email|NIP> [role] [unitId]");
    console.error("Roles:", VALID_ROLES.join(", "));
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error("Role harus salah satu:", VALID_ROLES.join(", "));
    process.exit(1);
  }

  const email = toEmail(input);
  const nip = /^[0-9]{4,32}[A-Za-z]{0,3}$/.test(input) ? input.toUpperCase() : null;

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

  // Cari UID via Firestore: cocokkan email dulu, lalu NIP bila ada.
  let uid = null;
  const byEmail = await db.collection("users").where("email", "==", email).limit(1).get();
  if (!byEmail.empty) {
    uid = byEmail.docs[0].id;
  } else if (nip) {
    const byNip = await db.collection("users").where("nip", "==", nip).limit(1).get();
    if (!byNip.empty) uid = byNip.docs[0].id;
  }
  if (!uid) {
    console.error(`Akun ${email} tidak ditemukan di koleksi users. Daftarkan dulu via halaman /admin/users.`);
    process.exit(1);
  }
  await db.collection("users").doc(uid).set(
    {
      email,
      ...(nip ? { nip } : {}),
      ...(unitId ? { unitId } : {}),
      role,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`OK: ${email} (${uid}) -> role=${role}${unitId ? ` unit=${unitId}` : ""}`);
}

main().catch((err) => {
  console.error("Gagal:", err.message);
  process.exit(1);
});
