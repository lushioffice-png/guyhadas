import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User
} from "firebase/auth";
import { auth, isAuthorizedEmail } from "../firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthorized: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mirrors admin.js's pattern: Firebase Auth tells us *who* is signed
    // in, but authorization (are they allowed in this app) is a separate
    // check against ADMIN_EMAILS - and is re-enforced server-side by
    // firestore.rules regardless of what the client decides here.
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && !isAuthorizedEmail(u.email)) {
        // Signed in with Firebase Auth successfully, but not an allowed
        // GuyHadas user - every Firestore read will be denied anyway, so
        // sign back out instead of showing a broken/empty app.
        firebaseSignOut(auth);
        setUser(null);
      } else {
        setUser(u);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value: AuthState = {
    user,
    loading,
    isAuthorized: isAuthorizedEmail(user?.email),
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      await firebaseSignOut(auth);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
