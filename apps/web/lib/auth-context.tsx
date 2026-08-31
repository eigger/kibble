"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken, clearToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (token: string) => Promise<User | null>;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const CACHED_USER_KEY = "kibble_cached_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (): Promise<User | null> => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) {
        if (res.status === 401) {
          clearToken();
          localStorage.removeItem(CACHED_USER_KEY);
          setUser(null);
        } else {
          localStorage.removeItem(CACHED_USER_KEY);
          setUser(null);
        }
        setLoading(false);
        return null;
      }
      const me = (await res.json()) as User;
      if (!me?.id || !me.email) {
        localStorage.removeItem(CACHED_USER_KEY);
        setUser(null);
        setLoading(false);
        return null;
      }
      setUser(me);
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(me));
      return me;
    } catch {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      const parsed = cached ? (JSON.parse(cached) as User) : null;
      setUser(parsed);
      return parsed;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible" && getToken()) {
        void fetchMe();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchMe]);

  async function login(token: string) {
    setToken(token);
    setLoading(true);
    return fetchMe();
  }

  async function clearLocalSession() {
    clearToken();
    localStorage.removeItem(CACHED_USER_KEY);
    setUser(null);
    router.push("/login");
  }

  async function logout() {
    try {
      if (getToken()) {
        await apiFetch("/api/auth/logout", { method: "POST" });
      }
    } catch {
      // ignore
    }
    await clearLocalSession();
  }

  async function logoutAll() {
    try {
      if (getToken()) {
        await apiFetch("/api/auth/logout-all", { method: "POST" });
      }
    } catch {
      // ignore
    }
    await clearLocalSession();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "ADMIN",
        login,
        refreshUser: fetchMe,
        logout,
        logoutAll,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function postLoginPath(user: User): string {
  return user.needsPet ? "/onboarding" : "/";
}
