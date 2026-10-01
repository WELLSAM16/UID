"use client";

import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait for Firebase Auth to initialize

    if (!user) {
      router.replace("/login");
      return;
    }

    if (requireAdmin && user.role !== "admin") {
      alert("Akses Ditolak: Halaman ini hanya untuk Admin.");
      router.replace("/beranda");
    }
  }, [user, loading, router, requireAdmin]);

  // Show a loading state while Firebase checks auth
  if (loading) {
    return (
      <div className="container flex-center" style={{ minHeight: "100vh" }}>
        <div className="live-indicator" style={{ width: "20px", height: "20px", backgroundColor: "var(--primary)" }}></div>
      </div>
    );
  }

  // Prevent rendering children if unauthorized (avoids flicker before redirect)
  if (!user || (requireAdmin && user.role !== "admin")) {
    return null;
  }

  return <>{children}</>;
}
