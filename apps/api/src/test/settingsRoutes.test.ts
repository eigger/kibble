import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SettingEntry } from "@kibble/shared";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const ADMIN = "admin_a";
const GENERAL = "general_a";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  setting: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const ROLES: Record<string, "ADMIN" | "GENERAL"> = { [ADMIN]: "ADMIN", [GENERAL]: "GENERAL" };

function token(app: FastifyInstance, userId = ADMIN): string {
  return app.jwt.sign({ sub: userId, role: ROLES[userId], tv: 1 }, { expiresIn: "1h" });
}

function entryFor(body: string, key: string): SettingEntry {
  const rows = JSON.parse(body) as SettingEntry[];
  const found = rows.find((row) => row.key === key);
  if (!found) throw new Error(`no entry for ${key}`);
  return found;
}

describe("settings routes — 연동 화면 (/integrations)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const id of Object.keys(ROLES)) invalidateTokenVersionCache(id);
    invalidateHouseholdCache(ADMIN);
    invalidateHouseholdCache(GENERAL);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      role: ROLES[where.id],
      tokenVersion: 1,
    }));
    mockPrisma.setting.findMany.mockResolvedValue([]);
    delete process.env.KAKAO_MAP_APP_KEY;

    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
    delete process.env.KAKAO_MAP_APP_KEY;
  });

  it("일반 사용자는 접근할 수 없다", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { authorization: `Bearer ${token(app, GENERAL)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("DB에 저장된 키는 마스킹해서 내려준다 — 원문은 절대 나가지 않는다", async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: "KAKAO_MAP_APP_KEY", value: "abcdef0123456789" },
    ]);
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("abcdef0123456789");

    const entry = entryFor(res.body, "KAKAO_MAP_APP_KEY");
    expect(entry).toMatchObject({ configured: true, source: "db", masked: "••••6789" });
    expect(entry.value).toBeUndefined();
  });

  // 관리자 화면이라도 개인키 꼬리는 내리지 않는다 — garage와 갈라지는 지점.
  it("VAPID 개인키는 꼬리 4자도 노출하지 않는다", async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: "VAPID_PRIVATE_KEY", value: "super-secret-private-key" },
    ]);
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(entryFor(res.body, "VAPID_PRIVATE_KEY").masked).toBe("••••");
    expect(res.body).not.toContain("super-secret-private-key");
    expect(res.body).not.toContain("-key");
  });

  it("DB에 없으면 .env 폴백을 출처와 함께 알려준다", async () => {
    process.env.KAKAO_MAP_APP_KEY = "envkey123456";
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(entryFor(res.body, "KAKAO_MAP_APP_KEY")).toMatchObject({
      configured: true,
      source: "env",
      masked: "••••3456",
    });
  });

  it("비밀값이 아닌 키는 원문을 내려준다 — 화면에서 고쳐야 한다", async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: "APP_PUBLIC_URL", value: "https://kibble.example.com" },
    ]);
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(entryFor(res.body, "APP_PUBLIC_URL").value).toBe("https://kibble.example.com");
  });

  it("화이트리스트 밖의 키는 거부한다", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings/DATABASE_URL",
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { value: "postgres://evil" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
  });

  // 한 쪽만 손으로 바꾸면 짝이 어긋나 푸시가 조용히 죽는다.
  it("VAPID 키 쌍은 직접 쓰거나 지울 수 없다", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/api/settings/VAPID_PRIVATE_KEY",
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { value: "hand-written" },
    });
    expect(put.statusCode).toBe(400);

    const del = await app.inject({
      method: "DELETE",
      url: "/api/settings/VAPID_PUBLIC_KEY",
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(del.statusCode).toBe(400);

    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.setting.deleteMany).not.toHaveBeenCalled();
  });

  it("허용된 키는 저장된다", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings/KAKAO_MAP_APP_KEY",
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { value: "  newkey  " },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "KAKAO_MAP_APP_KEY" } }),
    );
  });
});
