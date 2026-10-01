"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import ProtectedRoute from "@/components/ProtectedRoute";

function GantiPasswordForm() {
  const { user, changePassword, logout } = useAuth();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (pw1.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await changePassword(pw1);
    } catch (err: any) {
      setError(err.message || "Gagal mengganti password.");
      setSaving(false);
    }
  };

  return (
    <div className="container flex-center" style={{ minHeight: "100vh" }}>
      <div className="glass-panel" style={{ padding: "40px", width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.6rem", marginBottom: "8px", color: "#111" }}>
          Ganti Password
        </h2>
        <p style={{ marginBottom: "24px", fontSize: "0.9rem" }}>
          Halo {user?.name || user?.nip || ""}, password awal dari admin wajib diganti sebelum lanjut.
        </p>

        {error && (
          <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", textAlign: "left" }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: "16px", textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Password baru
          </label>
          <input
            type="password"
            className="input-field"
            placeholder="Minimal 6 karakter"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "30px", textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Konfirmasi password baru
          </label>
          <input
            type="password"
            className="input-field"
            placeholder="Ulangi password baru"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            className="btn"
            style={{ background: "#38bdf8", color: "white" }}
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan & Lanjut"}
          </button>
          <button
            className="btn"
            style={{ background: "transparent", color: "var(--text-muted)" }}
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GantiPasswordPage() {
  return (
    <ProtectedRoute>
      <GantiPasswordForm />
    </ProtectedRoute>
  );
}
