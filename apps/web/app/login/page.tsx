"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../../lib/api";
import { postLoginPath, useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingBootstrap, setCheckingBootstrap] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [bootstrapUnreachable, setBootstrapUnreachable] = useState(false);

  // "관리자가 이미 있다"와 "서버에 못 닿았다"를 구분해야 한다. 예전에는 실패를 모두
  // needsBootstrap=false로 흡수해서, 첫 부팅에 마이그레이션이 도는 동안 접속하면
  // 만들 수 없는 로그인 폼만 보였다.
  const checkBootstrap = useCallback(async () => {
    setCheckingBootstrap(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/bootstrap/status`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { needsBootstrap: boolean };
      setNeedsBootstrap(data.needsBootstrap);
      setBootstrapUnreachable(false);
    } catch {
      setBootstrapUnreachable(true);
    } finally {
      setCheckingBootstrap(false);
    }
  }, []);

  useEffect(() => {
    void checkBootstrap();
  }, [checkBootstrap]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(t("loginError"));
        return;
      }
      const data = await res.json();
      const user = await login(data.token);
      router.push(user ? postLoginPath(user) : "/");
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrapSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/bootstrap/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          setNeedsBootstrap(false);
          setError(t("adminExistsError"));
          return;
        }
        setError(t("accountCreateError"));
        return;
      }

      const loginRes = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!loginRes.ok) {
        setError(t("loginError"));
        return;
      }
      const data = await loginRes.json();
      const user = await login(data.token);
      router.push(user ? postLoginPath(user) : "/onboarding");
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  if (checkingBootstrap) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  if (bootstrapUnreachable) {
    return (
      <main className="container">
        <h1>{t("appName")}</h1>
        <p className="error-text">{t("bootstrapCheckFailed")}</p>
        <button type="button" onClick={() => void checkBootstrap()}>
          {t("retryButton")}
        </button>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>{t("appName")}</h1>
      {needsBootstrap ? (
        <>
          <p>{t("bootstrapIntro")}</p>
          <form onSubmit={handleBootstrapSubmit} className="form">
            <input
              type="text"
              autoComplete="name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t("passwordMinPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t("confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? t("creatingAccount") : t("createFirstAdmin")}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </>
      ) : (
        <>
          <p>{t("loginIntro")}</p>
          <form onSubmit={handleSubmit} className="form">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? t("loggingIn") : t("loginButton")}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </>
      )}
    </main>
  );
}
