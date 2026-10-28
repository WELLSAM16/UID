import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import {
  PUMK_DB_COLLECTION,
  validatePumkDbInput,
  type PumkDatabaseMitra,
} from "@/lib/pumkDatabase";

type Ctx = { params: Promise<{ id: string }> };

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * PATCH /api/pumk/database/[id] — ubah mitra.
 * Body parsial diperbolehkan; field yang tidak dikirim memakai nilai lama.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { response, user } = await requireAdmin(request);
  if (response || !user) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "ID mitra tidak valid" }, { status: 400 });

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });

  try {
    const db = getAdminDb();
    const collection = db.collection(PUMK_DB_COLLECTION);
    const ref = collection.doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Mitra tidak ditemukan" }, { status: 404 });
    }

    const existing = snap.data() || {};
    const parsed = validatePumkDbInput({ ...existing, ...body });
    if (!parsed.ok || !parsed.data) {
      return NextResponse.json({ error: parsed.error || "Data tidak valid" }, { status: 400 });
    }

    if (parsed.data.noIdKey !== existing.noIdKey) {
      const duplicate = await collection
        .where("noIdKey", "==", parsed.data.noIdKey)
        .limit(2)
        .get();
      if (duplicate.docs.some((doc) => doc.id !== id)) {
        return NextResponse.json(
          { error: `NO ID ${parsed.data.noId} sudah ada di database` },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const data: Omit<PumkDatabaseMitra, "id"> = {
      ...parsed.data,
      createdAt: typeof existing.createdAt === "string" ? existing.createdAt : now,
      source: typeof existing.source === "string" ? existing.source : "app",
      updatedAt: now,
      updatedBy: user.uid,
      updatedByEmail: user.email || null,
    };
    await ref.set(data, { merge: true });

    return NextResponse.json({ mitra: { id, ...data } });
  } catch (err) {
    console.error("PATCH /api/pumk/database/[id] error:", err);
    return NextResponse.json({ error: "Gagal memperbarui mitra PUMK" }, { status: 500 });
  }
}

/**
 * DELETE /api/pumk/database/[id] — hapus mitra.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "ID mitra tidak valid" }, { status: 400 });

  try {
    const ref = getAdminDb().collection(PUMK_DB_COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Mitra tidak ditemukan" }, { status: 404 });
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/pumk/database/[id] error:", err);
    return NextResponse.json({ error: "Gagal menghapus mitra PUMK" }, { status: 500 });
  }
}
