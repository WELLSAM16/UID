"use client";

import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Role } from "@/lib/roles";

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  allowedRoles,
  allowMustChangePassword = false,
}: {
  children: React.ReactNode;
  /** Legacy: true = hanya administrator / admin_uid. */
  requireAdmin?: boolean;
  /** Baru: batasi ke role tertentu (administrator selalu lolos). */
  allowedRoles?: Role[];
  /** True = halaman ini justru tempat menuntaskan wajib ganti password. */
  allowMustChangePassword?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAllowed = (role: string | undefined | null) => {
    if (!role) return false;
    if (allowedRoles && allowedRoles.length > 0) {
      if (role === "administrator" || role === "admin") return true;
      return allowedRoles.includes(role as Role);
    }
    if (requireAdmin) {
      return role === "administrator" || role === "admin_uid" || role === "admin";
    }
    return true;
  };

  useEffect(() => {
    if (loading) return; // Wait for Firebase Auth to initialize

    if (!user) {
      router.replace("/login");
      return;
    }

    if (user.mustChangePassword && !allowMustChangePassword) {
      router.replace("/ganti-password");
      return;
    }

    if (!isAllowed(user.role)) {
      alert("Akses Ditolak: role Anda tidak diizinkan membuka halaman ini.");
      router.replace("/beranda");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router, requireAdmin, allowedRoles?.join(",")]);

  // Show a loading state while Firebase checks auth
  if (loading) {
    return (
      <div className="container flex-center" style={{ minHeight: "100vh" }}>
        <div className="live-indicator" style={{ width: "20px", height: "20px", backgroundColor: "var(--primary)" }}></div>
      </div>
    );
  }

  // Prevent rendering children if unauthorized (avoids flicker before redirect)
  if (!user || !isAllowed(user.role)) {
    return null;
  }

  // Paksa ganti password awal sebelum bisa membuka halaman lain
  // (kecuali halaman ganti-password itu sendiri).
  if (user.mustChangePassword && !allowMustChangePassword) {
    return null;
  }

  return <>{children}</>;
}
