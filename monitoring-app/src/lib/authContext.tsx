"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  normalizeRole,
  loginToEmail,
  emailToNip,
  type Role,
  type UserProfile,
} from "./roles";

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  /** Login dengan NIP atau email khusus (admin/dev) + password. */
  login: (nipOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Ganti password + hapus flag mustChangePassword. */
  changePassword: (newPassword: string) => Promise<void>;
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function loadProfile(firebaseUser: FirebaseUser): Promise<UserProfile | null> {
  const docRef = doc(db, "users", firebaseUser.uid);
  const docSnap = await getDoc(docRef);
  // Tahap 1: tidak ada auto-create. Dokumen harus sudah dibuat admin.
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  if (data.isActive === false) return null;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    role: normalizeRole(data.role as string),
    nip: (data.nip as string) || emailToNip(firebaseUser.email) || undefined,
    name: data.name as string | undefined,
    unitId: data.unitId as string | undefined,
    isActive: data.isActive !== false,
    mustChangePassword: data.mustChangePassword === true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        try {
          const profile = await loadProfile(firebaseUser);
          // Dokumen tidak ada / dinonaktifkan -> paksa logout agar tidak nyangkut.
          if (!profile) {
            await signOut(auth);
            setUser(null);
          } else {
            setUser(profile);
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (nipOrEmail: string, password: string) => {
    let email: string;
    try {
      email = loginToEmail(nipOrEmail);
    } catch (err: any) {
      throw new Error(err.message || "NIP atau email tidak valid");
    }
    try {
      setLoading(true);
      // Hanya sign-in. Tidak ada pembuatan akun baru di sini.
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      const profile = await loadProfile(userCredential.user);
      if (!profile) {
        await signOut(auth);
        throw new Error("Akun belum terdaftar atau dinonaktifkan. Hubungi admin.");
      }
      setUser(profile);

      if (profile.mustChangePassword) {
        router.push("/ganti-password");
      } else {
        router.push("/beranda");
      }
    } catch (error: any) {
      setLoading(false);
      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password"
      ) {
        throw new Error("NIP/email atau password salah.");
      }
      throw new Error(error.message || "Login gagal.");
    }
  };

  const changePassword = async (newPassword: string) => {
    const current = auth.currentUser;
    if (!current) throw new Error("Belum login.");
    if (!newPassword || newPassword.length < 6)
      throw new Error("Password minimal 6 karakter.");
    await updatePassword(current, newPassword);
    // Hapus flag wajib ganti password di profil.
    const docRef = doc(db, "users", current.uid);
    await updateDoc(docRef, { mustChangePassword: false });
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
    router.push("/beranda");
  };

  const getToken = async (forceRefresh = false): Promise<string | null> => {
    const current = auth.currentUser;
    if (!current) return null;
    try {
      return await current.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  };

  const logout = async () => {
    setUser(null);
    await signOut(auth);
    router.replace("/");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export type { Role };
