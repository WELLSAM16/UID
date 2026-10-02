"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

/**
 * Laman pertama: teruskan sesuai status login.
 * - Sudah login -> /beranda (atau /ganti-password bila wajib ganti password).
 * - Belum login -> /login.
 */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.mustChangePassword) {
      router.replace("/ganti-password");
    } else {
      router.replace("/beranda");
    }
  }, [user, loading, router]);

  return (
    <div className="container flex-center" style={{ minHeight: "100vh" }}>
      <p>Memuat...</p>
    </div>
  );
}
