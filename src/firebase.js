import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const signInAnon = () => signInAnonymously(auth);

export const loadUserData = async (uid) => {
  try {
    const ref = doc(db, "users", uid, "data", "main");
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
};

export const saveUserData = async (uid, data) => {
  try {
    const ref = doc(db, "users", uid, "data", "main");
    await setDoc(ref, data);
  } catch {}
};