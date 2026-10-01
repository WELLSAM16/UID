import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, requireUser } from "@/lib/authServer";
import {
  nowISO,
  parseSpreadsheetInput,
  validatePressSource,
  type PressReleaseSource,
} from "@/lib/pressSources";

const COLLECTION = "press_release_sources";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(data as PressReleaseSource) };
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

async function deactivateOthers(
  db: FirebaseFirestore.Firestore,
  exceptId: string
) {
  const snap = await db.collection(COLLECTION).where("isActive", "==", true).get();
  const batch = db.batch();
  let n = 0;
  snap.docs.forEach((d) => {
    if (d.id !== exceptId) {
      batch.update(d.ref, { isActive: false, updatedAt: nowISO() });
      n++;
    }
  });
  if (n > 0) await batch.commit();
}

/**
 * GET /api/press-release-sources — semua user login boleh baca (untuk dropdown).
 */
export async function GET(request: NextRequest) {
  const { response } = await requireUser(request);
  if (response) return response;

  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).get();
    const items = snap.docs.map((d) => toResponse(d.id, d.data()));
    // Aktif dulu, lalu tahun terbaru, lalu label
    items.sort((a, b) => {
      if (!!a.isActive !== !!b.isActive) return a.isActive ? -1 : 1;
      if (a.validYear !== b.validYear) return b.validYear - a.validYear;
      return a.label.localeCompare(b.label);
    });
    return NextResponse.json({ sources: items });
  } catch (err: any) {
    console.error("GET /api/press-release-sources error:", err);
    return NextResponse.json(
      { error: "Gagal memuat sumber press release", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/press-release-sources — admin only.
 * Body: { label, spreadsheetUrl?, sheetId?, gid?, targetPerUnit, validYear, isActive? }
 */
export async function POST(request: NextRequest) {
  const { response, user } = await requireAdmin(request);
  if (response) return response;
  const u = user!;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  // Dukung input link penuh ATAU sheetId mentah
  let sheetId = typeof body.sheetId === "string" ? body.sheetId.trim() : "";
  let gid = body.gid !== undefined ? String(body.gid).trim() : "0";
  if (body.spreadsheetUrl) {
    const p = parseSpreadsheetInput(String(body.spreadsheetUrl));
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
    sheetId = p.sheetId!;
    // GID dari link diutamakan bila field gid tidak diisi eksplisit
    if (body.gid === undefined || String(body.gid).trim() === "") gid = p.gid!;
  }

  const v = validatePressSource({
    label: body.label,
    sheetId,
    gid,
    targetPerUnit: body.targetPerUnit,
    validYear: body.validYear,
    isActive: body.isActive,
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const db = getAdminDb();
    const existing = await db.collection(COLLECTION).get();
    const t = nowISO();
    // Sumber pertama otomatis jadi aktif
    const isActive = existing.empty ? true : body.isActive === true;

    const doc: PressReleaseSource = {
      label: String(body.label).trim(),
      sheetId,
      gid,
      targetPerUnit: Number(body.targetPerUnit),
      validYear: Number(body.validYear),
      isActive,
      createdBy: u.uid,
      createdByEmail: u.email,
      createdAt: t,
      updatedAt: t,
    };
    const ref = await db.collection(COLLECTION).add(doc);
    if (isActive) await deactivateOthers(db, ref.id);
    const fresh = await ref.get();
    return NextResponse.json(
      { source: toResponse(ref.id, fresh.data()!) },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/press-release-sources error:", err);
    return NextResponse.json(
      { error: "Gagal menambah sumber", details: err?.message },
      { status: 500 }
    );
  }
}
