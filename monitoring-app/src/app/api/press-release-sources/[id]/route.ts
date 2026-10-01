import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import {
  nowISO,
  parseSpreadsheetInput,
  validatePressSource,
} from "@/lib/pressSources";

const COLLECTION = "press_release_sources";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(data as Record<string, unknown>) };
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

type Ctx = { params: Promise<{ id: string }> };

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
 * PATCH /api/press-release-sources/[id] — admin only.
 * Update parsial { label?, spreadsheetUrl?, sheetId?, gid?, targetPerUnit?, validYear? }
 * atau { action: "setActive" } untuk menjadikan sumber ini aktif.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  const { id } = await ctx.params;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Sumber tidak ditemukan" }, { status: 404 });
    }
    const current = snap.data() as Record<string, unknown>;

    if (body.action === "setActive") {
      await ref.update({ isActive: true, updatedAt: nowISO() });
      await deactivateOthers(db, id);
      const fresh = await ref.get();
      return NextResponse.json({ source: toResponse(id, fresh.data()!) });
    }

    let sheetId =
      body.sheetId !== undefined ? String(body.sheetId).trim() : (current.sheetId as string);
    let gid =
      body.gid !== undefined ? String(body.gid).trim() : ((current.gid as string) || "0");
    if (body.spreadsheetUrl) {
      const p = parseSpreadsheetInput(String(body.spreadsheetUrl));
      if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
      sheetId = p.sheetId!;
      if (body.gid === undefined || String(body.gid).trim() === "") gid = p.gid!;
    }

    const merged = {
      label: body.label !== undefined ? body.label : current.label,
      sheetId,
      gid,
      targetPerUnit: body.targetPerUnit !== undefined ? body.targetPerUnit : current.targetPerUnit,
      validYear: body.validYear !== undefined ? body.validYear : current.validYear,
    };
    const v = validatePressSource({ ...merged, isActive: true });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const patch: Record<string, unknown> = {
      label: String(merged.label).trim(),
      sheetId,
      gid,
      targetPerUnit: Number(merged.targetPerUnit),
      validYear: Number(merged.validYear),
      updatedAt: nowISO(),
    };
    if (body.isActive === true) patch.isActive = true;
    else if (body.isActive === false) patch.isActive = false;

    await ref.update(patch);
    if (patch.isActive === true) await deactivateOthers(db, id);
    const fresh = await ref.get();
    return NextResponse.json({ source: toResponse(id, fresh.data()!) });
  } catch (err: any) {
    console.error(`PATCH /api/press-release-sources/${id} error:`, err);
    return NextResponse.json(
      { error: "Gagal memperbarui sumber", details: err?.message },
      { status: 500 }
    );
  }
}

/** DELETE /api/press-release-sources/[id] — admin only. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  const { id } = await ctx.params;

  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Sumber tidak ditemukan" }, { status: 404 });
    }
    const wasActive = (snap.data() as Record<string, unknown>)?.isActive === true;
    await ref.delete();

    // Bila yang dihapus adalah sumber aktif, aktifkan sisa terbaru agar
    // monitoring tetap punya default.
    if (wasActive) {
      const rest = await db.collection(COLLECTION).get();
      const items: { id: string; validYear?: unknown }[] = rest.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      }));
      items.sort((a, b) => Number(b.validYear || 0) - Number(a.validYear || 0));
      if (items[0]) {
        await db.collection(COLLECTION).doc(items[0].id).update({ isActive: true, updatedAt: nowISO() });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal menghapus sumber", details: err?.message },
      { status: 500 }
    );
  }
}
