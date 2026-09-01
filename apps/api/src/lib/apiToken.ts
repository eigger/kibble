import { createHash, randomBytes } from "node:crypto";

export const API_TOKEN_PREFIX = "kbl_";

export function generateApiTokenPlaintext(): string {
  return `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function isApiTokenPlaintext(value: string): boolean {
  return value.startsWith(API_TOKEN_PREFIX) && value.length > API_TOKEN_PREFIX.length + 16;
}
