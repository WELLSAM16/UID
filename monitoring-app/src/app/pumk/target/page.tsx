"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { PUMK_TARGET_UNITS, currentYear } from "@/lib/pumkTarget";
import { formatUnitDisplay } from "@/lib/roles";

interface PumkTarget {
  id: string;
  unitId: string;
  tahun: string;
  targetInventarisasi: number;
  targetRupiahKembali: number;
  targetMitra: number;
  assignedNoIds?: string[];
  status: "Active" | "Paused";
  updatedAt?: string;
}

interface Visit {
  id: string;
  unitId: string;
  tanggalKunjungan: string;
  noId: string;
  jenisTindakLanjut: string;
  totalSaldo: number;
  status: string;
}

const EMPTY = {
  unitId: "UP3 BINTARO",
  tahun: currentYear(),
  targetInventarisasi: "",
  targetRupiahKembali: "",
  targetMitra: "",
  assignedNoIds: "",
  status: "Active" as "Active" | "Paused",
};

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function pct(real: number, target: number): number {
  if (!target || target <= 0) return real > 0 ? 100 : 0;
  return Math.min(100, Math.round((real / target) * 100));
}

function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 100 ? "#10b981" : v >= 50 ? "#38bdf8" : "#f59e0b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "140px" }}>
      <div style={{ flex: 1, height: "8px", borderRadius: "999px", background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", background: color, borderRadius: "999px" }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, minWidth: "38px", textAlign: "right" }}>{v}%</span>
    </div>
  );
}

export default function PumkTargetPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [tahun, setTahun] = useState(currentYear());
  const [targets, setTargets] = useState<PumkTarget[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PumkTarget | null>(null);
  const [formData, setFormData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showIds, setShowIds] = useState<string | null>(null);

  const isAdmin =
    user?.role === "administrator" ||
    user?.role === "admin_uid" ||
    (user?.role as string) === "admin";

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      let token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json", ...(init?.headers || {}) };
      if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      let res = await fetch(url, { ...init, headers, cache: "no-store" });
      if (res.status === 401) {
        token = await getToken(true);
        if (token) {
          (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
          res = await fetch(url, { ...init, headers, cache: "no-store" });
        }
        if (res.status === 401) router.replace("/login");
      }
      return res;
    },
    [getToken, router]
  );

  const parseJson = async (res: Response) => {
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`API ${res.status}: body bukan JSON (potongan: ${text.slice(0, 120)})`);
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${data.error || "gagal"}`);
    return data;
  };

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`/api/pumk-targets?tahun=${encodeURIComponent(tahun)}`),
        authFetch("/api/pumk-visits"),
      ]);
      const [d1, d2] = await Promise.all([parseJson(r1), parseJson(r2)]);
      setTargets(d1.targets || []);
      setVisits(d2.visits || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, tahun]);

  useEffect(() => {
    load();
  }, [load]);

  const progress = useMemo(() => {
    const map = new Map<string, { inv: number; rupiah: number; mitra: Set<string> }>();
    for (const t of targets) map.set(t.id, { inv: 0, rupiah: 0, mitra: new Set() });
    const byUnit = new Map<string, PumkTarget[]>();
    for (const t of targets) {
      const list = byUnit.get(t.unitId) || [];
      list.push(t);
      byUnit.set(t.unitId, list);
    }
    for (const v of visits) {
      if (v.status !== "approved") continue;
      if (!String(v.tanggalKunjungan || "").startsWith(tahun)) continue;
      const list = byUnit.get(v.unitId);
      if (!list) continue;
      const active = list.find((t) => t.status === "Active") || list[0];
      if (!active) continue;
      const slot = map.get(active.id);
      if (!slot) continue;
      if (v.jenisTindakLanjut === "Inventarisasi") slot.inv += 1;
      if (v.jenisTindakLanjut === "Penagihan") slot.rupiah += Number(v.totalSaldo || 0);
      if (v.noId) slot.mitra.add(String(v.noId).trim().toUpperCase());
    }
    return map;
  }, [targets, visits, tahun]);

  const handleOpenModal = (target?: PumkTarget) => {
    if (target) {
      setEditTarget(target);
      setFormData({
        unitId: target.unitId,
        tahun: target.tahun,
        targetInventarisasi: String(target.targetInventarisasi),
        targetRupiahKembali: String(target.targetRupiahKembali),
        targetMitra: String(target.targetMitra),
        assignedNoIds: (target.assignedNoIds || []).join("\n"),
        status: target.status,
      });
    } else {
      setEditTarget(null);
      setFormData({ ...EMPTY, tahun });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inv = parseInt(formData.targetInventarisasi, 10);
    const rupiah = Number(formData.targetRupiahKembali);
    const mitra = parseInt(formData.targetMitra, 10);
    if (!formData.unitId || !formData.tahun) {
      alert("Unit dan tahun wajib diisi!");
      return;
    }
    if (isNaN(inv) || inv < 0 || isNaN(mitra) || mitra < 0 || isNaN(rupiah) || rupiah < 0) {
      alert("Target harus angka >= 0!");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        unitId: formData.unitId,
        tahun: formData.tahun.trim(),
        targetInventarisasi: inv,
        targetRupiahKembali: rupiah,
        targetMitra: mitra,
        assignedNoIds: formData.assignedNoIds,
        status: formData.status,
      };
      let res: Response;
      if (editTarget) {
        res = await authFetch(`/api/pumk-targets/${editTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch("/api/pumk-targets", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await parseJson(res);
      setIsModalOpen(false);
      load();
    } catch (e: any) {
      alert("Gagal menyimpan: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus target PUMK ini?")) return;
    try {
      const res = await authFetch(`/api/pumk-targets/${id}`, { method: "DELETE" });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal hapus: " + e.message);
    }
  };

  const assignedCount = (s: string) =>
    s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).length;

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Target PUMK per Unit</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111", fontSize: "0.9rem" }}>
            Admin UID menetapkan target inventarisasi, rupiah kembali, dan mitra yang ditangani tiap UP3/UP2D.
            Capaian dihitung dari kunjungan <b>approved</b> tahun berjalan.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="text"
            inputMode="numeric"
            className="input-field"
            value={tahun}
            onChange={(e) => setTahun(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder="2026"
            style={{ width: "100px" }}
            title="Tahun"
          />
          {isAdmin && (
            <button className="btn" onClick={() => handleOpenModal()} style={{ background: "#38bdf8", color: "white" }}>
              + Set Target
            </button>
          )}
        </div>
      </header>

      {loading && <div className="glass-panel" style={{ padding: "24px" }}>Memuat target PUMK…</div>}
      {error && <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)" }}>{error}</div>}

      {!loading && !error && (
        <div className="glass-panel" style={{ padding: "24px", overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Target Mitra</th>
                <th>Target Inventarisasi</th>
                <th>Target Rupiah Kembali</th>
                <th>Daftar Mitra (UID)</th>
                <th>Status</th>
                <th style={{ minWidth: "220px" }}>Capaian (approved {tahun})</th>
                {isAdmin && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {targets.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: "center" }}>
                    Belum ada target tahun {tahun}. {isAdmin ? "Klik “Set Target”." : "Hubungi Admin UID."}
                  </td>
                </tr>
              ) : (
                targets.map((t) => {
                  const p = progress.get(t.id);
                  const realInv = p?.inv || 0;
                  const realRp = p?.rupiah || 0;
                  const realMitra = p?.mitra.size || 0;
                  const ids = t.assignedNoIds || [];
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatUnitDisplay(t.unitId)}</td>
                      <td style={{ fontWeight: 600 }}>{t.targetMitra.toLocaleString("id-ID")}</td>
                      <td style={{ fontWeight: 600 }}>{t.targetInventarisasi.toLocaleString("id-ID")}</td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{rp(t.targetRupiahKembali)}</td>
                      <td>
                        {ids.length === 0 ? (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        ) : (
                          <button
                            className="btn"
                            style={{ padding: "4px 10px", fontSize: "0.8rem", background: "rgba(56,189,248,0.12)" }}
                            onClick={() => setShowIds(showIds === t.id ? null : t.id)}
                          >
                            {ids.length} mitra {showIds === t.id ? "▾" : "▸"}
                          </button>
                        )}
                      </td>
                      <td>
                        <span style={{
                          padding: "4px 8px",
                          background: t.status === "Active" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                          color: t.status === "Active" ? "var(--success)" : "var(--danger)",
                          borderRadius: "4px", fontSize: "0.8rem",
                        }}>
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.82rem" }}>
                          <div>
                            <div style={{ marginBottom: "2px" }}>
                              Mitra: <b>{realMitra.toLocaleString("id-ID")}/{t.targetMitra.toLocaleString("id-ID")}</b>
                            </div>
                            <Bar value={pct(realMitra, t.targetMitra)} />
                          </div>
                          <div>
                            <div style={{ marginBottom: "2px" }}>
                              Inventarisasi: <b>{realInv.toLocaleString("id-ID")}/{t.targetInventarisasi.toLocaleString("id-ID")}</b>
                            </div>
                            <Bar value={pct(realInv, t.targetInventarisasi)} />
                          </div>
                          <div>
                            <div style={{ marginBottom: "2px" }}>
                              Rupiah: <b>{rp(realRp)} / {rp(t.targetRupiahKembali)}</b>
                            </div>
                            <Bar value={pct(realRp, t.targetRupiahKembali)} />
                          </div>
                        </div>
                      </td>
                      {isAdmin && (
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            className="btn"
                            style={{ padding: "6px 12px", marginRight: "8px", background: "rgba(255,255,255,0.1)" }}
                            onClick={() => handleOpenModal(t)}
                          >
                            Edit
                          </button>
                          <button className="btn btn-danger" style={{ padding: "6px 12px" }} onClick={() => handleDelete(t.id)}>
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {showIds && (
            <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "10px", background: "rgba(56,189,248,0.07)", fontSize: "0.85rem" }}>
              <b>Daftar NO ID mitra ditangani ({(targets.find((t) => t.id === showIds)?.assignedNoIds || []).length}):</b>
              <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {(targets.find((t) => t.id === showIds)?.assignedNoIds || []).map((id) => (
                  <span key={id} style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(0,0,0,0.06)", fontSize: "0.78rem" }}>{id}</span>
                ))}
              </div>
            </div>
          )}

          {!isAdmin && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "12px" }}>
              Role unit hanya melihat target + capaian. Perubahan target dilakukan Admin UID.
            </p>
          )}
        </div>
      )}

      {isModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px",
        }}>
          <div className="glass-panel" style={{ padding: "30px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: "6px" }}>{editTarget ? "Edit Target PUMK" : "Set Target PUMK"}</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 0 }}>
              Satu baris aktif per unit per tahun. Daftar mitra = NO ID dari SPS (kolom CASCADING UP), satu per baris.
            </p>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Unit*</label>
                  <select
                    className="input-field"
                    value={formData.unitId}
                    onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    style={{ width: "100%" }}
                  >
                    {PUMK_TARGET_UNITS.map((u) => (
                      <option key={u} value={u}>{formatUnitDisplay(u)}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Tahun*</label>
                  <input
                    className="input-field"
                    inputMode="numeric"
                    value={formData.tahun}
                    onChange={(e) => setFormData({ ...formData, tahun: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                    placeholder="2026"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Mitra Ditangani* (cascading)</label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  placeholder="Cth: 40"
                  value={formData.targetMitra}
                  onChange={(e) => setFormData({ ...formData, targetMitra: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Inventarisasi* (mitra selesai)</label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  placeholder="Cth: 25"
                  value={formData.targetInventarisasi}
                  onChange={(e) => setFormData({ ...formData, targetInventarisasi: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Rupiah Kembali* (Rp)</label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  placeholder="Cth: 500000000"
                  value={formData.targetRupiahKembali}
                  onChange={(e) => setFormData({ ...formData, targetRupiahKembali: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>
                  Daftar NO ID Mitra Ditangani (opsional, {assignedCount(formData.assignedNoIds)} terisi)
                </label>
                <textarea
                  className="input-field"
                  rows={5}
                  placeholder={"Satu NO ID per baris, cth:\n01-01-778/93\n01-01-207/00"}
                  value={formData.assignedNoIds}
                  onChange={(e) => setFormData({ ...formData, assignedNoIds: e.target.value })}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: "30px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Status</label>
                <select
                  className="input-field"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as "Active" | "Paused" })}
                >
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" className="btn" style={{ background: "rgba(255,255,255,0.1)" }} onClick={() => setIsModalOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
