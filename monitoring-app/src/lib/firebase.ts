import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBMHaKr1Fc4mZ8g2TC7JbR0vF7gcyxj4F8",
  authDomain: "monitoring-dashboard-11a1a.firebaseapp.com",
  projectId: "monitoring-dashboard-11a1a",
  storageBucket: "monitoring-dashboard-11a1a.firebasestorage.app",
  messagingSenderId: "906415110043",
  appId: "1:906415110043:web:ab154b34893e6a973b933e",
  measurementId: "G-VH89NQED58"
};

// Initialize Firebase (Singleton pattern for Next.js)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
