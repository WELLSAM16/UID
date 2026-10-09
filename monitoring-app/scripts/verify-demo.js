// scripts/verify-demo.js — hitung dokumen demo:true per koleksi (read-only).
const { readFileSync } = require("fs");
const { join } = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function loadEnv() {
  const lines = readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n");
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

async function main() {
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  const db = getFirestore();
  const cols = ["skoring_targets", "medmas_entries", "evp_reports", "pumk_visits", "stakeholders", "stakeholder_activities", "kpi_targets"];
  for (const c of cols) {
    const s = await db.collection(c).where("demo", "==", true).get();
    console.log(`${c}: ${s.size}`);
  }
}

main().catch((err) => {
  console.error("Gagal:", err.message);
  process.exit(1);
});
