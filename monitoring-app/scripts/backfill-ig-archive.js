// scripts/backfill-ig-archive.js
// ─────────────────────────────────────────────────────────────
// Backfill SATU KALI: tarik SELURUH histori postingan IG (sampai post
// pertama) via Composio, lalu upsert ke sheet arsip harian.
// Dijalankan dari laptop operator (bukan serverless — tidak ada timeout):
//
//   node scripts/backfill-ig-archive.js --account=all
//   node scripts/backfill-ig-archive.js --account=welldrone --max-posts=500
//   node scripts/backfill-ig-archive.js --dry-run --max-posts=2
//
// Opsi:
//   --account=<username|all>  akun monitored_accounts (default: all)
//   --max-posts=N             batas per akun, 0 = sampai habis (default: 0)
//   --dry-run                 hanya fetch + tampilkan ringkasan, tanpa tulis sheet
//   --skip-insights           lewati insights (reach/plays/views/saved/shares = 0)
//   --concurrency=N           paralelisme insights (default: 3, pelan agar
//                             tidak kena rate-limit)
//   --from-scratch            abaikan checkpoint, kerjakan ulang semua akun
//
// Checkpoint tersimpan di scripts/.backfill-checkpoint.json — akun yang
// sudah selesai dilewati saat skrip dijalankan ulang (terhenti/rate-limit).
// Kredensial dibaca dari monitoring-app/.env.local (FIREBASE_*,
// COMPOSIO_API_KEY, IG_ARCHIVE_SHEET_ID). Jangan commit file checkpoint.

const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { google } = require("googleapis");

const ROOT = join(__dirname, "..");
const CHECKPOINT_PATH = join(__dirname, ".backfill-checkpoint.json");
const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1/tools/execute";
const DEFAULT_SHEET_ID = "18MIdVzIkC1QohR9up3YMysRy_zG5qjewqbWKttsyTok";
const HEADER = [
  "id", "timestamp", "account", "username", "media_type", "caption",
  "permalink", "likes", "comments", "plays", "views", "reach",
  "impressions", "shares", "saved", "synced_at",
];

function loadEnv() {
  const envPath = join(ROOT, ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
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

function parseArgs() {
  const a = {
    account: "all", maxPosts: 0, dryRun: false,
    skipInsights: false, concurrency: 3, fromScratch: false,
  };
  let skipNext = false;
  for (let k = 0; k < process.argv.length; k++) {
    if (skipNext) { skipNext = false; continue; }
    const raw = process.argv[k];
    const valOf = (prefix) => {
      if (raw.startsWith(prefix + "=")) return raw.slice(prefix.length + 1);
      if (raw === prefix) { skipNext = true; return process.argv[k + 1]; }
      return undefined;
    };
    let v;
    if ((v = valOf("--account")) !== undefined) a.account = v;
    else if ((v = valOf("--max-posts")) !== undefined) a.maxPosts = parseInt(v, 10) || 0;
    else if ((v = valOf("--concurrency")) !== undefined) a.concurrency = Math.max(1, parseInt(v, 10) || 3);
    else if (raw === "--dry-run") a.dryRun = true;
    else if (raw === "--skip-insights") a.skipInsights = true;
    else if (raw === "--from-scratch") a.fromScratch = true;
    else if (k >= 2) { console.error("Argumen tidak dikenal: " + raw); process.exit(1); }
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCheckpoint() {
  try {
    if (existsSync(CHECKPOINT_PATH)) return JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  } catch { /* rusak = mulai baru */ }
  return { completedAccounts: [] };
}
function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

async function callComposio(apiKey, entityId, connectedAccountId, tool, args, retries = 3) {
  const delays = [2000, 15000, 60000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${COMPOSIO_BASE}/${tool}`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, connected_account_id: connectedAccountId, arguments: args }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && !json.error) return json.data;
    const msg = typeof json.error === "string" ? json.error : JSON.stringify(json.error || res.status);
    // Error permanen (mis. insights postingan yang terbit sebelum akun
    // menjadi business) — retry tidak akan membantu, langsung gagal.
    if (/posted before your|does not exist|not found|unsupported get request|media (was|has been) deleted/i.test(msg)) {
      throw new Error(msg);
    }
    const rateLimited = res.status === 429 || /rate|too many|quota/i.test(msg);
    if (attempt < retries) {
      const wait = rateLimited ? 60000 : (delays[attempt] || 60000);
      console.log(`    ↻ ${tool} gagal (${msg.slice(0, 100)}), tunggu ${wait / 1000}s lalu ulangi…`);
      await sleep(wait);
      continue;
    }
    throw new Error(msg);
  }
}

// Pagination mundur sampai post pertama (atau maxPosts).
async function fetchAllMedia(apiKey, account, maxPosts) {
  const { entity_id, connected_account_id, username } = account;
  const all = [];
  let cursor;
  let page = 0;
  while (true) {
    const args = {
      ig_user_id: "me",
      fields: "id,caption,media_type,permalink,timestamp,username,like_count,comments_count",
      limit: 50,
    };
    if (cursor) args.after = cursor;
    const data = await callComposio(apiKey, entity_id, connected_account_id, "INSTAGRAM_GET_USER_MEDIA", args);
    page++;
    let batch = [];
    if (Array.isArray(data)) batch = data;
    else if (Array.isArray(data?.data)) batch = data.data;
    if (batch.length === 0) break;
    all.push(...batch);
    console.log(`  [${username}] hal ${page}: +${batch.length} (total ${all.length})`);
    if (maxPosts > 0 && all.length >= maxPosts) return all.slice(0, maxPosts);
    let next = data?.paging?.cursors?.after || data?.paging?.next || data?.next;
    if (!next) break; // cursor habis = post pertama tercapai
    cursor = typeof next === "string" ? next : undefined;
    if (cursor && cursor.startsWith("http")) {
      try { cursor = new URL(cursor).searchParams.get("after") || cursor; } catch { /* pakai apa adanya */ }
    }
    if (!cursor) break;
    await sleep(500); // sopan ke rate-limit
  }
  return all;
}

async function fetchInsights(apiKey, account, post, skip) {
  const base = {
    id: post.id,
    caption: post.caption || "",
    media_type: post.media_type || "IMAGE",
    permalink: post.permalink || "#",
    timestamp: post.timestamp || "",
    username: post.username || account.username,
    source_account: account.username,
    reach: 0, impressions: 0,
    likes: post.like_count || 0, comments: post.comments_count || 0,
    shares: 0, saved: 0, plays: 0, views: 0,
  };
  if (skip) return base;
  let metrics = "views,reach,saved,shares,total_interactions";
  if (post.media_type === "VIDEO") metrics = "plays,views,reach,saved,shares,total_interactions";
  else if (post.media_type === "CAROUSEL_ALBUM") metrics = "views,reach,saved,shares,total_interactions";
  try {
    const data = await callComposio(apiKey, account.entity_id, account.connected_account_id,
      "INSTAGRAM_GET_POST_INSIGHTS", { ig_post_id: post.id, metric: metrics });
    const m = {};
    const items = Array.isArray(data?.data) ? data.data : [];
    for (const it of items) {
      const v = it?.values?.[0]?.value;
      m[it.name] = (v !== undefined && v !== null && !isNaN(Number(v))) ? Number(v) : 0;
    }
    return {
      ...base,
      reach: m.reach ?? 0,
      impressions: m.views ?? m.impressions ?? 0,
      likes: post.like_count ?? m.likes ?? 0,
      comments: post.comments_count ?? m.comments ?? 0,
      shares: m.shares ?? 0,
      saved: m.saved ?? 0,
      plays: m.plays ?? 0,
      views: m.views ?? m.plays ?? 0,
    };
  } catch (e) {
    console.log(`    ⚠ insights ${post.id} gagal (${String(e.message).slice(0, 80)}) — pakai angka dasar`);
    return base;
  }
}

async function mapWithConcurrency(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
      if ((idx + 1) % 25 === 0) console.log(`    insights ${idx + 1}/${items.length}…`);
    }
  });
  await Promise.all(workers);
  return out;
}

const num = (v) => (isFinite(Number(v)) ? Math.round(Number(v)) : 0);
function postToRow(p, syncedAt) {
  return [
    String(p.id), String(p.timestamp || ""), String(p.source_account || p.username),
    String(p.username), String(p.media_type || "IMAGE"), String(p.caption || "").slice(0, 10000),
    String(p.permalink || "#"), num(p.likes), num(p.comments), num(p.plays), num(p.views),
    num(p.reach), num(p.impressions), num(p.shares), num(p.saved), syncedAt,
  ];
}

async function main() {
  const args = parseArgs();
  const env = loadEnv();
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = env;
  const privateKey = (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const apiKey = env.COMPOSIO_API_KEY;
  const sheetId = env.IG_ARCHIVE_SHEET_ID || DEFAULT_SHEET_ID;
  if (!projectId || !clientEmail || !privateKey) {
    console.error("FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY belum diisi di .env.local");
    process.exit(1);
  }
  if (!apiKey) { console.error("COMPOSIO_API_KEY belum diisi di .env.local"); process.exit(1); }

  if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore();
  let accounts = (await db.collection("monitored_accounts").where("status", "==", "Active").get())
    .docs.map((d) => d.data());
  if (accounts.length === 0 && env.COMPOSIO_ENTITY_ID) {
    accounts = [{ username: "default", entity_id: env.COMPOSIO_ENTITY_ID, connected_account_id: "" }];
  }
  if (args.account !== "all") {
    accounts = accounts.filter((a) => a.username === args.account);
    if (!accounts.length) { console.error(`Akun "${args.account}" tidak ditemukan di monitored_accounts`); process.exit(1); }
  }
  console.log(`Akun: ${accounts.map((a) => a.username).join(", ")} | max-posts: ${args.maxPosts || "sampai habis"}${args.dryRun ? " | DRY-RUN" : ""}`);

  const cp = args.fromScratch ? { completedAccounts: [] } : loadCheckpoint();
  if (cp.completedAccounts.length && !args.fromScratch) {
    console.log(`Checkpoint: lewati yang sudah selesai (${cp.completedAccounts.join(", ")})`);
  }

  let sheets = null, tab = "Sheet1", idToRow = new Map(), nextRow = 2;
  if (!args.dryRun) {
    const auth = new google.auth.JWT({
      email: clientEmail, key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheets = google.sheets({ version: "v4", auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
    tab = meta.data.sheets?.[0]?.properties?.title || "Sheet1";
    const head = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${tab}!A1:P1` });
    if ((head.data.values?.[0] || []).join("|") !== HEADER.join("|")) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId, range: `${tab}!A1:P1`,
        valueInputOption: "RAW", requestBody: { values: [HEADER] },
      });
      console.log("Header ditulis.");
    }
    const ids = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${tab}!A2:A` });
    (ids.data.values || []).forEach((r, i) => {
      const id = String(r[0] || "").trim();
      if (id && !idToRow.has(id)) idToRow.set(id, i + 2);
    });
    nextRow = idToRow.size + 2;
    console.log(`Sheet "${tab}": ${idToRow.size} baris sudah ada.`);
  }

  let totalAppended = 0, totalUpdated = 0;
  for (const account of accounts) {
    if (cp.completedAccounts.includes(account.username)) {
      console.log(`⏭ ${account.username}: sudah selesai (checkpoint), dilewati.`);
      continue;
    }
    console.log(`\n▶ ${account.username}: paginasi media…`);
    const media = await fetchAllMedia(apiKey, account, args.maxPosts);
    console.log(`  Total media: ${media.length}. Tarik insights (concurrency ${args.concurrency})…`);
    const syncedAt = new Date().toISOString();
    const posts = await mapWithConcurrency(media, args.concurrency,
      (m) => fetchInsights(apiKey, account, m, args.skipInsights));

    if (args.dryRun) {
      const oldest = posts.map((p) => p.timestamp).filter(Boolean).sort()[0] || "-";
      console.log(`  DRY-RUN ${account.username}: ${posts.length} postingan, tertua ${oldest}. Tidak menulis sheet.`);
      continue;
    }

    const updates = [], appends = [];
    for (const p of posts) {
      if (!p?.id) continue;
      const row = postToRow(p, syncedAt);
      const rn = idToRow.get(String(p.id));
      if (rn) updates.push({ range: `${tab}!B${rn}:P${rn}`, values: [row.slice(1)] });
      else { appends.push(row); idToRow.set(String(p.id), nextRow++); }
    }
    for (let i = 0; i < updates.length; i += 100) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: "RAW", data: updates.slice(i, i + 100) },
      });
      console.log(`  update ${Math.min(i + 100, updates.length)}/${updates.length}…`);
    }
    for (let i = 0; i < appends.length; i += 100) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId, range: `${tab}!A:P`,
        valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
        requestBody: { values: appends.slice(i, i + 100) },
      });
      console.log(`  append ${Math.min(i + 100, appends.length)}/${appends.length}…`);
    }
    totalAppended += appends.length;
    totalUpdated += updates.length;
    cp.completedAccounts.push(account.username);
    saveCheckpoint(cp);
    console.log(`✔ ${account.username}: ${appends.length} baru, ${updates.length} refresh.`);
    await sleep(1000);
  }

  console.log(`\nSELESAI — baru: ${totalAppended}, refresh: ${totalUpdated}.`);
  if (!args.dryRun) {
    console.log("Hapus checkpoint bila ingin menjalankan ulang penuh:");
    console.log(`  del "${CHECKPOINT_PATH}"`);
  }
}

main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
