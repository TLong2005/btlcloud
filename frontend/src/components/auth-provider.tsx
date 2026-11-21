"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import {
  clearSession,
  getStoredUser,
  getToken,
  setSession,
  type User,
} from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  signIn: (accessToken: string, user: User) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setReady(true);
      return;
    }

    let cancelled = false;
    api<User>("/api/me")
      .then((me) => {
        if (cancelled) return;
        setSession(token, me);
        setUser(me);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.statusCode === 401) {
          setUser(null);
          setReady(true);
          return;
        }

        const stored = getStoredUser();
        if (stored) {
          setUser(stored);
          toast.error("Không kết nối được máy chủ. Đang dùng phiên đã lưu.");
        } else {
          clearSession();
          setUser(null);
          toast.error("Không kết nối được máy chủ.");
        }
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    if (user && (pathname === "/login" || pathname === "/")) {
      router.replace("/documents");
    }
  }, [ready, user, pathname, router]);

  const signIn = useCallback(
    (accessToken: string, nextUser: User) => {
      setSession(accessToken, nextUser);
      setUser(nextUser);
      router.replace("/documents");
    },
    [router],
  );

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, ready, signIn, signOut }),
    [user, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
