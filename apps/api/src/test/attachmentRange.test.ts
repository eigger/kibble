import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const HH_A = "household_a";
const USER_A = "user_a";
const TOKEN_VERSION = 1;

/** 앞 4바이트로 시작 구간을, 뒤 4바이트로 끝 구간을 구분할 수 있게 만든 본문 */
const BODY = "ABCDEFGHIJ0123456789";
const REL_PATH = "events/clip.mp4";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  attachment: { findFirst: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

/**
 * 영상 재생은 Range에 달려 있다 — 200으로 전체만 돌려주면 탐색이 매번 처음부터
 * 다시 받는 일이 되고, iOS Safari는 재생을 거부하기도 한다. 회귀로 되돌아가기
 * 쉬운 부분이라 라우트 수준에서 못박는다.
 */
describe("첨부 파일 서빙 — Range", () => {
  let app: FastifyInstance;
  let uploadDir = "";
  let cookie = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-range-"));
    process.env.UPLOAD_DIR = uploadDir;
    await mkdir(path.join(uploadDir, "events"), { recursive: true });
    await writeFile(path.join(uploadDir, REL_PATH), BODY);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH_A, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: TOKEN_VERSION });
    mockPrisma.attachment.findFirst.mockResolvedValue({ mime: "video/mp4", path: REL_PATH });

    const { buildApp } = await import("../app.js");
    const { signMediaToken } = await import("../lib/mediaAuth.js");
    app = await buildApp({ logger: false });
    cookie = signMediaToken(app, USER_A, TOKEN_VERSION);
  });

  afterEach(async () => {
    await app.close();
    delete process.env.UPLOAD_DIR;
    vi.resetModules();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  async function getFile(range?: string) {
    const { MEDIA_COOKIE_NAME } = await import("../lib/mediaAuth.js");
    return app.inject({
      method: "GET",
      url: `/api/attachments/file/${REL_PATH}`,
      cookies: { [MEDIA_COOKIE_NAME]: cookie },
      ...(range ? { headers: { range } } : {}),
    });
  }

  it("advertises range support and a length on a plain GET", async () => {
    const res = await getFile();
    expect(res.statusCode).toBe(200);
    expect(res.headers["accept-ranges"]).toBe("bytes");
    // 길이가 없으면 <video>가 재생 시간을 못 재고 진행바도 안 잡힌다
    expect(res.headers["content-length"]).toBe(String(BODY.length));
    expect(res.headers["content-type"]).toContain("video/mp4");
    expect(res.body).toBe(BODY);
  });

  it("returns 206 with only the requested bytes", async () => {
    const res = await getFile("bytes=10-14");
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 10-14/${BODY.length}`);
    expect(res.headers["content-length"]).toBe("5");
    expect(res.body).toBe("01234");
  });

  it("serves an open-ended range to the last byte", async () => {
    const res = await getFile("bytes=16-");
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 16-19/${BODY.length}`);
    expect(res.body).toBe("6789");
  });

  it("answers a range past the end with 416", async () => {
    const res = await getFile("bytes=999-");
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe(`bytes */${BODY.length}`);
  });

  // 포스터는 별도 라우트 없이 같은 경로로 나간다 — 인증·격리 검사를 두 벌로 만들지 않는다
  it("serves a poster frame as jpeg through the same route", async () => {
    const posterRel = "events/clip-poster.jpg";
    await writeFile(path.join(uploadDir, posterRel), "poster-bytes");
    // 영상 행이 posterPath로 찾힌 상황 — path는 영상 쪽을 가리킨다
    mockPrisma.attachment.findFirst.mockResolvedValue({ mime: "video/mp4", path: REL_PATH });

    const { MEDIA_COOKIE_NAME } = await import("../lib/mediaAuth.js");
    const res = await app.inject({
      method: "GET",
      url: `/api/attachments/file/${posterRel}`,
      cookies: { [MEDIA_COOKIE_NAME]: cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.body).toBe("poster-bytes");
  });

  it("still 404s a path with no attachment row (K-1 유지)", async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue(null);
    const res = await getFile("bytes=0-1");
    expect(res.statusCode).toBe(404);
  });

  it("404s when the row exists but the file is gone from disk", async () => {
    await rm(path.join(uploadDir, REL_PATH));
    const res = await getFile();
    expect(res.statusCode).toBe(404);
  });
});
