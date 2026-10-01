"use client";

import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ROLE_LABELS } from "@/lib/roles";

function ProfilContent() {
  const { user } = useAuth();
  const router = useRouter();

  const rows: [string, string][] = [
    ["Nama", user?.name || "-"],
    ["NIP", user?.nip || "-"],
    ["Email", user?.email || "-"],
    ["Role", ROLE_LABELS[user?.role || ""] || user?.role || "-"],
    ["Unit", user?.unitId || "-"],
    ["Status", user?.isActive === false ? "Nonaktif" : "Aktif"],
  ];

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Profil Saya</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Data akun Anda yang terdaftar oleh admin.
        </p>
      </header>

      <section className="glass-panel" style={{ padding: "24px" }}>
        {rows.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              padding: "12px 0",
              borderBottom: "1px solid var(--card-border)",
              fontSize: "0.9rem",
            }}
          >
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
            <span style={{ color: "#111", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value}</span>
          </div>
        ))}

        <button
          className="btn"
          style={{ marginTop: "24px", width: "100%", background: "#38bdf8", color: "white" }}
          onClick={() => router.push("/ganti-password")}
        >
          Ganti Password
        </button>
      </section>
    </div>
  );
}

export default function ProfilPage() {
  return (
    <ProtectedRoute>
      <ProfilContent />
    </ProtectedRoute>
  );
}
