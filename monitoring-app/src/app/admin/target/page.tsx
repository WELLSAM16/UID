"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";

interface SkoringTarget {
  id: string;
  startDate: string;
  endDate: string;
  targetScore: number;
  targetPosts: number;
  status: "Active" | "Paused";
  updatedAt?: string;
}

const EMPTY = { startDate: "", endDate: "", targetScore: "", targetPosts: "", status: "Active" as "Active" | "Paused" };

export default function TargetManagement() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [targets, setTargets] = useState<SkoringTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SkoringTarget | null>(null);
  const [formData, setFormData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

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
      const res = await authFetch("/api/targets");
      const data = await parseJson(res);
      setTargets(data.targets || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, authFetch, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenModal = (target?: SkoringTarget) => {
    if (target) {
      setEditTarget(target);
      setFormData({
        startDate: target.startDate,
        endDate: target.endDate,
        targetScore: String(target.targetScore),
        targetPosts: String(target.targetPosts),
        status: target.status,
      });
    } else {
      setEditTarget(null);
      setFormData(EMPTY);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate || !formData.targetScore || !formData.targetPosts) {
      alert("Harap lengkapi semua field target!");
      return;
    }
    const targetScore = parseFloat(formData.targetScore);
    const targetPosts = parseInt(formData.targetPosts, 10);
    if (isNaN(targetScore) || isNaN(targetPosts) || targetScore <= 0 || targetPosts <= 0) {
      alert("Target Skor dan Target Postingan harus angka > 0!");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...formData, targetScore, targetPosts };
      let res: Response;
      if (editTarget) {
        res = await authFetch(`/api/targets/${editTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch("/api/targets", {
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
    if (!confirm("Apakah Anda yakin ingin menghapus target ini?")) return;
    try {
      const res = await authFetch(`/api/targets/${id}`, { method: "DELETE" });
      await parseJson(res);
      load();
    } catch (e: any) {
      alert("Gagal hapus: " + e.message);
    }
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.5rem", margin: 0, color: "#111" }}>Target Skoring dan Postingan</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111" }}>Atur target & skoring</p>
        </div>
        <button className="btn" onClick={() => handleOpenModal()} style={{ background: "#38bdf8", color: "white" }}>+ Tambah Target</button>
      </header>

      {loading && <div className="glass-panel" style={{ padding: "24px" }}>Memuat target…</div>}
      {error && <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)" }}>{error}</div>}

      {!loading && !error && (
        <div className="glass-panel" style={{ padding: "24px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rentang Tanggal</th>
                <th>Target Skor</th>
                <th>Target Postingan</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {targets.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center" }}>Belum ada target. Klik “Tambah Target”.</td></tr>
              ) : (
                targets.map(target => (
                  <tr key={target.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{target.startDate} s/d {target.endDate}</td>
                    <td style={{ fontWeight: 600 }}>{target.targetScore.toLocaleString("id-ID")}</td>
                    <td style={{ fontWeight: 600 }}>{target.targetPosts.toLocaleString("id-ID")}</td>
                    <td>
                      <span style={{
                        padding: "4px 8px",
                        background: target.status === "Active" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                        color: target.status === "Active" ? "var(--success)" : "var(--danger)",
                        borderRadius: "4px", fontSize: "0.8rem"
                      }}>
                        {target.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: "6px 12px", marginRight: "10px", background: "rgba(255, 255, 255, 0.1)" }}
                        onClick={() => handleOpenModal(target)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: "6px 12px" }}
                        onClick={() => handleDelete(target.id)}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px"
        }}>
          <div className="glass-panel" style={{ padding: "30px", width: "100%", maxWidth: "500px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: "20px" }}>{editTarget ? "Edit Target" : "Tambah Target Baru"}</h2>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Start Date*</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>End Date*</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Skor*</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Cth: 500"
                  value={formData.targetScore}
                  onChange={e => setFormData({ ...formData, targetScore: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Postingan*</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Cth: 10"
                  value={formData.targetPosts}
                  onChange={e => setFormData({ ...formData, targetPosts: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "30px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Status</label>
                <select
                  className="input-field"
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as "Active" | "Paused" })}
                  style={{ backgroundColor: "rgba(30, 41, 59, 0.9)" }}
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
