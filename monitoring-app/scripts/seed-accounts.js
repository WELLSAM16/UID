// scripts/seed-accounts.js
// ─────────────────────────
// Script sekali pakai untuk memasukkan data akun Instagram ke Firestore.
// 
// KEAMANAN (Koreksi 3):
//   - TIDAK ada private key hardcode — semua dibaca dari .env.local
//   - Pastikan .gitignore sudah menutupi **/serviceAccount*.json
//   - Hapus atau generik-kan script ini setelah selesai seed
// 
// Cara pakai:
//   node scripts/seed-accounts.js

const { readFileSync } = require("fs");
const { join } = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// ─── Baca .env.local ───
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
        // Kupas tanda kutip ganda atau tunggal di awal dan akhir string
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
    return env;
}

const env = loadEnv();

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, atau FIREBASE_PRIVATE_KEY belum diisi di .env.local");
    console.error("   Isi dulu, lalu jalankan ulang script ini.");
    process.exit(1);
}

// ─── Init Firebase Admin ───
if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ─── Data akun yang akan di-seed ───
// entity_id sama untuk kedua akun (normal — Composio default user).
// Yang membedakan adalah connected_account_id.
const accounts = [
    {
        username: "akun_pertama",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca_l59wvR8Y2YAY",
        status: "Active",
    },
    {
        username: "welldrone",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca_o8gvymjHtwAY",
        status: "Inactive",
    },
    {
        username: "clipnews",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca_YRMqD2DtVRQu",
        status: "Active",
    },
    {
        username: "berkabarnews",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca__pr3zZRrOSoB",
        status: "Active",
    },
    {
        username: "lifeatpondokaren",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca_UvkZb-EnZS2o",
        status: "Active",
    },
    {
        username: "newstangsel24jam",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca_0riqMugMeAM-",
        status: "Active",
    },
    {
        username: "seputarnewstangsel",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca_LnqYA-LgO7ba",
        status: "Active",
    },
    {
        username: "bintaro03update",
        ig_user_id: "me",
        entity_id: env.COMPOSIO_ENTITY_ID || "pg-test-d4dca093-d06b-4a03-bcbe-3aa6ae8602b9",
        connected_account_id: "ca_cYpnloppUQ3H",
        status: "Active",
    },
];

async function seed() {
    console.log(`\n📝 Seeding ${accounts.length} akun ke Firestore collection "monitored_accounts"...\n`);

    for (const acct of accounts) {
        // Gunakan connected_account_id sebagai document ID agar idempoten
        const docRef = db.collection("monitored_accounts").doc(acct.connected_account_id);
        await docRef.set(acct, { merge: true });
        console.log(`  ✅ ${acct.username} (${acct.connected_account_id}) — saved`);
    }

    console.log("\n🎉 Seed selesai! Anda bisa memverifikasi di Firebase Console.\n");
}

seed().catch(err => {
    console.error("❌ Seed gagal:", err.message);
    process.exit(1);
});
