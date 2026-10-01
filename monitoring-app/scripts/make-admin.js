// scripts/make-admin.js
// ─────────────────────────
// Promote/demote user role via Admin SDK (bypass Firestore rules).
// Hanya dijalankan oleh operator yang memegang service account.
//
// Cara pakai:
//   node scripts/make-admin.js <email> [admin|user]
//   node scripts/make-admin.js suwito@gmail.com admin
//
// Lookup user by email via Auth, lalu set users/{uid} { role, email }.

const { readFileSync } = require("fs");
const { join } = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

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

async function main() {
  const email = process.argv[2];
  const role = process.argv[3] || "admin";
  if (!email) {
    console.error("Usage: node scripts/make-admin.js <email> [admin|user]");
    process.exit(1);
  }
  if (!["admin", "user"].includes(role)) {
    console.error("Role harus admin atau user");
    process.exit(1);
  }

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

  const auth = getAuth();
  const db = getFirestore();

  const user = await auth.getUserByEmail(email);
  await db.collection("users").doc(user.uid).set(
    { email: user.email, role, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  console.log(`OK: ${email} (${user.uid}) -> role=${role}`);
}

main().catch((err) => {
  console.error("Gagal:", err.message);
  process.exit(1);
});
