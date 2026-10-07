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
  it("skips the case-insensitive scan when the exact row exists", async () => {
    const findMany = vi.fn();
    const db = {
      user: { findUnique: vi.fn(async () => ({ id: "u1" })), findMany },
    } as unknown as PrismaClient;
    expect(await findLoginCandidates(db, "mom@example.com")).toEqual([{ id: "u1" }]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
