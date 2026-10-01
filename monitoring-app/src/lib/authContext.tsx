"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "./firebase";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

type Role = "admin" | "user" | null;

interface UserProfile {
  uid: string;
  email: string;
  role: Role;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        // Fetch role from Firestore
        try {
          const docRef = doc(db, "users", firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          
          let role: Role = "user";
          if (docSnap.exists()) {
            role = docSnap.data().role as Role;
          } else {
            // If document doesn't exist, create it (fallback)
            await setDoc(docRef, { email: firebaseUser.email, role: "user" });
          }

          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role,
          });
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

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      let userCredential;
      try {
        // Try to sign in first
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (error: any) {
        // If user not found, create one with least-privilege default
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
        } else {
            throw error;
        }
      }

      if (userCredential && userCredential.user) {
          // Role is NEVER taken from client input — source of truth is Firestore.
          // New accounts default to "user". Promotion to "admin" only via
          // scripts/make-admin.js (Admin SDK) by an existing admin.
          const docRef = doc(db, "users", userCredential.user.uid);
          const snap = await getDoc(docRef);
          if (!snap.exists()) {
            await setDoc(docRef, {
              email: userCredential.user.email,
              role: "user",
              createdAt: new Date().toISOString(),
            });
            setUser({
              uid: userCredential.user.uid,
              email: userCredential.user.email || email,
              role: "user",
            });
          } else {
            const role = (snap.data().role as Role) || "user";
            setUser({
              uid: userCredential.user.uid,
              email: userCredential.user.email || email,
              role,
            });
          }

          router.push("/beranda");
      }
    } catch (error: any) {
      alert("Login gagal: " + error.message);
      setLoading(false);
      throw error;
    }
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
    await signOut(auth);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getToken }}>
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
