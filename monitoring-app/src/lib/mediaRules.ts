/**
 * Matriks izin file media per koleksi Firestore.
 *
 * Dipakai API upload-url/download-url untuk memutuskan apakah user boleh
 * menulis/membaca file milik sebuah dokumen. Izin TIDAK ditaruh di PC —
 * PC hanya memverifikasi tanda tangan token.
 */
import type { AuthedUser } from "@/lib/authServer";
import { isAdminRole } from "@/lib/roles";
import { MEDIA_PLAN_MIME, MEDIA_VIDEO_MAX_BYTES } from "@/lib/mediaShared";

export interface MediaFieldRule {
  /** Sub-folder di PC, mis. "form-o". */
  folder: string;
  /** Label untuk pesan error. */
  label: string;
  /** Override tipe file khusus field ini (mis. foto evidence hanya gambar). */
  allowedMime?: readonly string[];
}

export interface MediaCollectionRule {
  /** Prefix path di PC, mis. "pumk-visits". */
  prefix: string;
  /** Field dokumen yang boleh diberi file (harus berakhiran "Path"). */
  fields: Record<string, MediaFieldRule>;
  /** Status dokumen yang masih boleh diubah pemiliknya. */
  editableStatuses: string[];
  /** true = akses baca lintas user dalam unit yang sama. */
  unitScoped: boolean;
  /** Override tipe file yang diterima (default: PDF/gambar). */
  allowedMime?: readonly string[];
  /** Override batas ukuran file (default MEDIA_MAX_BYTES = 10 MB). */
  maxBytes?: number;
  canWrite: (doc: Record<string, any>, user: AuthedUser) => boolean;
  canRead: (doc: Record<string, any>, user: AuthedUser) => boolean;
}

/** Penulis dokumen (saat status masih bisa diedit) atau admin. */
function ownerEditable(
  doc: Record<string, any>,
  user: AuthedUser,
  statuses: string[]
): boolean {
  if (isAdminRole(user.role)) return true;
  return doc.authorUid === user.uid && statuses.includes(String(doc.status || ""));
}

/** Penulis, admin, atau siapa pun di unit yang sama. */
function ownerUnitOrAdmin(doc: Record<string, any>, user: AuthedUser): boolean {
  if (isAdminRole(user.role)) return true;
  if (doc.authorUid === user.uid) return true;
  return Boolean(doc.unitId) && doc.unitId === user.unitId;
}

/** Penulis atau admin saja (dokumen tanpa unit, mis. draf medsos). */
function ownerOrAdmin(doc: Record<string, any>, user: AuthedUser): boolean {
  return isAdminRole(user.role) || doc.authorUid === user.uid;
}

export const MEDIA_COLLECTIONS: Record<string, MediaCollectionRule> = {
  pumk_visits: {
    prefix: "pumk-visits",
    editableStatuses: ["draft"],
    unitScoped: true,
    fields: {
      formOPath: { folder: "form-o", label: "Form O" },
      dokumenLainPath: { folder: "dokumen-lain", label: "Dokumen lain" },
      buktiBayarPath: { folder: "bukti-bayar", label: "Bukti pembayaran" },
      evidencePath: {
        folder: "evidence",
        label: "Foto bukti kunjungan",
        allowedMime: ["image/jpeg", "image/png", "image/webp"],
      },
    },
    canWrite: (doc, user) => ownerEditable(doc, user, ["draft"]),
    canRead: ownerUnitOrAdmin,
  },

  evp_reports: {
    prefix: "evp-reports",
    editableStatuses: ["draft"],
    unitScoped: true,
    fields: {
      evidenPath: { folder: "eviden", label: "Eviden" },
    },
    canWrite: (doc, user) => ownerEditable(doc, user, ["draft"]),
    canRead: ownerUnitOrAdmin,
  },

  content_drafts: {
    prefix: "content-drafts",
    editableStatuses: ["draft", "rejected"],
    unitScoped: false,
    fields: {
      mediaPath: { folder: "media", label: "Media" },
      docPath: { folder: "doc", label: "Dokumen rencana" },
    },
    canWrite: (doc, user) => ownerEditable(doc, user, ["draft", "rejected"]),
    canRead: ownerOrAdmin,
  },

  press_release_drafts: {
    prefix: "press-release-drafts",
    editableStatuses: ["draft", "rejected"],
    unitScoped: false,
    fields: {
      mediaPath: { folder: "media", label: "Media" },
    },
    canWrite: (doc, user) => ownerEditable(doc, user, ["draft", "rejected"]),
    canRead: ownerOrAdmin,
  },

  stakeholder_activities: {
    prefix: "stakeholder-activities",
    editableStatuses: ["draft", "revisi_tl"],
    unitScoped: true,
    // Satu field logis berisi banyak file (evidencePaths[]).
    fields: {
      evidencePaths: { folder: "bukti", label: "Bukti kegiatan" },
    },
    canWrite: (doc, user) => ownerEditable(doc, user, ["draft", "revisi_tl"]),
    canRead: ownerUnitOrAdmin,
  },

  // Rencana postingan UP: UID yang menulis, semua unit boleh membaca/mengunduh.
  posting_plans: {
    prefix: "posting-plans",
    editableStatuses: [],
    unitScoped: false,
    fields: {
      mediaPaths: { folder: "media", label: "Media postingan" },
    },
    allowedMime: MEDIA_PLAN_MIME,
    maxBytes: MEDIA_VIDEO_MAX_BYTES,
    canWrite: (_doc, user) => isAdminRole(user.role),
    canRead: () => true,
  },
};
