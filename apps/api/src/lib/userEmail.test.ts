import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { emailInUse, findLoginCandidates } from "./userEmail.js";

describe("emailInUse", () => {
  it("looks for case-only duplicates, excluding the caller's own row", async () => {
    const findFirst = vi.fn(async () => ({ id: "other" }));
    const db = { user: { findFirst } } as unknown as PrismaClient;
    await expect(emailInUse(db, "mom@example.com", "me")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "mom@example.com", mode: "insensitive" }, id: { not: "me" } },
      select: { id: true },
    });
  });

  it("is false when nothing matches", async () => {
    const db = { user: { findFirst: vi.fn(async () => null) } } as unknown as PrismaClient;
    await expect(emailInUse(db, "new@example.com")).resolves.toBe(false);
  });
});

describe("findLoginCandidates", () => {
  const user = (id: string, email: string, createdAt: string) => ({ id, email, createdAt: new Date(createdAt) });

  it("always queries case-insensitively, oldest first", async () => {
    const findMany = vi.fn(async () => []);
    const db = { user: { findMany } } as unknown as PrismaClient;
    await findLoginCandidates(db, "mom@example.com");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "mom@example.com", mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("puts the exactly stored match first and keeps the rest oldest first", async () => {
    // A(Mom@, 옛) · B(mom@, 새) 중복 — 입력은 소문자라 B가 먼저, A도 후보에 남는다
    const rows = [
      user("A", "Mom@Example.com", "2026-01-01"),
      user("C", "MOM@Example.com", "2026-02-01"),
      user("B", "mom@example.com", "2026-03-01"),
    ];
    const db = { user: { findMany: vi.fn(async () => rows) } } as unknown as PrismaClient;
    const ids = (await findLoginCandidates(db, "mom@example.com")).map((u) => u.id);
    expect(ids).toEqual(["B", "A", "C"]);
  });
});
