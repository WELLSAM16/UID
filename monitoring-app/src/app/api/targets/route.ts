import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, requireUser } from "@/lib/authServer";
import {
  toDateOnly,
  validateSkoringTarget,
  type SkoringTarget,
} from "@/lib/targets";

const COLLECTION = "skoring_targets";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(data as SkoringTarget) };
}

async function readBody(request: NextRequest): Promise<any> {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * GET /api/targets — user login mana pun boleh baca (untuk tampil di skoring).
 */
export async function GET(request: NextRequest) {
  const { response } = await requireUser(request);
  if (response) return response;

  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).get();
    const items = snap.docs.map((d) => toResponse(d.id, d.data()));
    // Rentang terbaru dulu
    items.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return NextResponse.json({ targets: items });
  } catch (err: any) {
    console.error("GET /api/targets error:", err);
    return NextResponse.json(
      { error: "Gagal memuat target", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/targets — admin only.
 * Body: { startDate, endDate, targetScore, targetPosts, status? }
 */
export async function POST(request: NextRequest) {
  const { response, user } = await requireAdmin(request);
  if (response) return response;
  const u = user!;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  const v = validateSkoringTarget(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const t = new Date().toISOString();
    const doc: SkoringTarget = {
      startDate: toDateOnly(String(body.startDate)),
      endDate: toDateOnly(String(body.endDate)),
      targetScore: Number(body.targetScore),
      targetPosts: Number(body.targetPosts),
      status: body.status === "Paused" ? "Paused" : "Active",
      createdBy: u.uid,
      createdByEmail: u.email,
      createdAt: t,
      updatedAt: t,
    };
    const db = getAdminDb();
    const ref = await db.collection(COLLECTION).add(doc);
    const fresh = await ref.get();
    return NextResponse.json(
      { target: toResponse(ref.id, fresh.data()!) },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/targets error:", err);
    return NextResponse.json(
      { error: "Gagal membuat target", details: err?.message },
      { status: 500 }
    );
  }
}
