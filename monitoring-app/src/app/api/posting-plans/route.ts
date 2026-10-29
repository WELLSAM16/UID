import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, requireUser } from "@/lib/authServer";
import {
  POSTING_PLAN_COLLECTION,
  POSTING_PLAN_MAX_CAPTION,
  validatePostingPlan,
} from "@/lib/postingPlan";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * GET /api/posting-plans?bulan=YYYY-MM
 * Semua role yang login boleh membaca kalender rencana postingan UP.
 */
export async function GET(request: Request) {
  const { response } = await requireUser(request);
  if (response) return response;

  const params = new URL(request.url).searchParams;
  const bulan = params.get("bulan") || "";

  try {
    const snap = await getAdminDb().collection(POSTING_PLAN_COLLECTION).get();
    let items = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as object) })) as any[];
    if (/^\d{4}-\d{2}$/.test(bulan)) {
      items = items.filter((p) => String(p.tanggal || "").slice(0, 7) === bulan);
    }
    items.sort((a, b) => {
      const byDate = String(a.tanggal || "").localeCompare(String(b.tanggal || ""));
      if (byDate !== 0) return byDate;
      return String(a.judul || "").localeCompare(String(b.judul || ""));
    });
    return NextResponse.json({ plans: items });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal memuat rencana postingan", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posting-plans — buat rencana (UID/admin).
 * Body: { tanggal, judul, caption }. Media diunggah setelah dokumen ada.
 */
export async function POST(request: Request) {
  const { response, user } = await requireAdmin(request);
  if (response || !user) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const v = validatePostingPlan({
    tanggal: body.tanggal,
    judul: body.judul,
    caption: body.caption,
    mediaPaths: body.mediaPaths ?? [],
    mediaNames: body.mediaNames ?? [],
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const now = new Date().toISOString();
  try {
    const ref = await getAdminDb().collection(POSTING_PLAN_COLLECTION).add({
      tanggal: String(body.tanggal),
      judul: String(body.judul).trim(),
      caption: String(body.caption ?? "").slice(0, POSTING_PLAN_MAX_CAPTION),
      mediaPaths: (body.mediaPaths ?? []).map((p: unknown) => String(p)),
      mediaNames: (body.mediaNames ?? []).map((n: unknown) => String(n).slice(0, 120)),
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal menyimpan rencana postingan", details: err?.message },
      { status: 500 }
    );
  }
}
