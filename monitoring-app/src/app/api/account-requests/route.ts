import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import {
  validateNip,
  normalizeUnitId,
  ROLE_LABELS,
  type Role,
} from "@/lib/roles";
import {
  REQUESTABLE_ROLES,
  validateRequestEmail,
  normalizePhone,
} from "@/lib/accountRequests";

const COLLECTION = "account_requests";

// Rate-limit sederhana in-memory (per IP): 5 request / jam.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= 5) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * POST /api/account-requests — PUBLIK (tanpa login).
 * Body: { nip, name, role (staff|team_leader|asman), unitId, email, phone? }
 * Membuat dokumen status=pending untuk disetujui admin.
 */
export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: "Terlalu banyak pengajuan. Coba lagi 1 jam kemudian." },
      { status: 429 }
    );
  }

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const nip = String(body.nip || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const role = String(body.role || "") as Role;
  const unitRaw = String(body.unitId || "").trim();
  const email = String(body.email || "").trim();
  const phoneRaw = body.phone !== undefined && body.phone !== null ? String(body.phone) : "";

  const nipErr = validateNip(nip);
  if (nipErr) return NextResponse.json({ error: nipErr }, { status: 400 });
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Nama lengkap wajib diisi" }, { status: 400 });
  }
  if (!(REQUESTABLE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: `Role hanya boleh: ${REQUESTABLE_ROLES.map((r) => ROLE_LABELS[r]).join(", ")}` },
      { status: 400 }
    );
  }
  const unitId = normalizeUnitId(unitRaw);
  if (!unitId) {
    return NextResponse.json({ error: "Unit wajib dipilih dari daftar" }, { status: 400 });
  }
  const emailErr = validateRequestEmail(email);
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
  let phone: string | null = null;
  if (phoneRaw.trim()) {
    phone = normalizePhone(phoneRaw);
    if (!phone) {
      return NextResponse.json({ error: "Nomor WA tidak valid (gunakan 08xx)" }, { status: 400 });
    }
  }

  const db = getAdminDb();
  // NIP tidak boleh sudah punya akun ATAU pengajuan pending.
  const [dupUser, dupPending] = await Promise.all([
    db.collection("users").where("nip", "==", nip).limit(1).get(),
    db.collection(COLLECTION).where("nip", "==", nip).where("status", "==", "pending").limit(1).get(),
  ]);
  if (!dupUser.empty) {
    return NextResponse.json({ error: "NIP sudah terdaftar. Silakan login." }, { status: 409 });
  }
  if (!dupPending.empty) {
    return NextResponse.json(
      { error: "NIP ini sudah mengajukan dan sedang menunggu persetujuan admin." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const ref = await db.collection(COLLECTION).add({
    nip,
    name,
    role,
    unitId,
    email,
    phone,
    channel: "email",
    status: "pending",
    emailSent: false,
    emailError: null,
    waStatus: null,
    uid: null,
    note: null,
    createdAt: now,
    decidedAt: null,
    decidedBy: null,
  });

  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}

/**
 * GET /api/account-requests — admin saja (daftar pengajuan).
 * Query opsional: ?status=pending (default semua, pending dulu).
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "administrator" && user.role !== "admin_uid" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const status = new URL(request.url).searchParams.get("status");
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTION);
  if (status === "pending" || status === "approved" || status === "rejected") {
    q = q.where("status", "==", status);
  }
  const snap = await q.get();
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));
  // Pending teratas, lalu terbaru.
  const rank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
  items.sort((a: any, b: any) => {
    const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (r !== 0) return r;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return NextResponse.json({ requests: items });
}
