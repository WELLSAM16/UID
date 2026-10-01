"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";

export default function LoginPage() {
  const { login, loading } = useAuth();
  const [nip, setNip] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!nip || !password) {
      setError("Masukkan NIP/email dan password");
      return;
    }
    try {
      setIsLoggingIn(true);
      setError(null);
      await login(nip, password);
    } catch (err: any) {
      setError(err.message || "Login gagal.");
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="container flex-center" style={{ minHeight: "100vh" }}>
        <p>Loading Authentication...</p>
      </div>
    );
  }

  return (
    <div className="container flex-center" style={{ minHeight: "100vh" }}>
      <div className="glass-panel" style={{ padding: "40px", width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <h2 style={{ fontSize: "2rem", marginBottom: "8px", color: "#111" }}>
          Login
        </h2>
        <p style={{ marginBottom: "24px", fontSize: "0.9rem" }}>
          Gunakan NIP yang didaftarkan admin (administrator dapat memakai email)
        </p>

        {error && (
          <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", textAlign: "left" }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: "16px", textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            NIP / Email
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="NIP, atau email khusus admin"
            value={nip}
            onChange={(e) => setNip(e.target.value.trimStart())}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
          />
        </div>

        <div style={{ marginBottom: "30px", textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Password
          </label>
          <input
            type="password"
            className="input-field"
            placeholder="Password dari admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <button
            className="btn"
            style={{ background: "#38bdf8", color: "white" }}
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? "Logging in..." : "Login"}
          </button>
        </div>

        <p style={{ marginTop: "20px", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: "1.5" }}>
          *Belum punya akun? Minta administrator mendaftarkan NIP Anda terlebih dahulu.
        </p>
      </div>
    </div>
  );
}
