const INSECURE_JWT_SECRETS = new Set(["", "changeme", "dev-secret-change-me"]);

/** WORKPLAN §7.6 — tokenVersion으로 즉시 무효화 가능하므로 30일. */
export const JWT_EXPIRES_IN = "30d";

export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? "";
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && INSECURE_JWT_SECRETS.has(secret)) {
    console.error(
      "FATAL: JWT_SECRET must be set to a strong random value in production (not empty, changeme, or dev-secret-change-me). Generate one with: openssl rand -hex 32",
    );
    process.exit(1);
  }

  if (!secret) {
    console.warn("JWT_SECRET이 설정되지 않았습니다. 개발용 폴백을 사용합니다. .env를 확인하세요.");
    return "dev-secret-change-me";
  }

  return secret;
}

export function isInsecureJwtSecret(secret: string): boolean {
  return INSECURE_JWT_SECRETS.has(secret);
}
