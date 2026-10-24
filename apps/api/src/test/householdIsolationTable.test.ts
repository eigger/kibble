import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

/**
 * K-3 격리 테이블 테스트 — householdIsolation.test.ts가 다루지 않은 라우트들이
 * 남의 가구 id를 받으면 404/빈 결과를 돌려주고, 조회 where에 householdId가 들어가며,
 * 어떤 쓰기도 일어나지 않는지 한 표로 확인한다.
 * (`/api/states`의 가구 밖 펫 404와 토큰 펫 스코프 403은 stateRoutes.test.ts가 이미 지킨다.)
 */

const HH_A = "household_a";
const USER_A = "user_a";
const OTHER = "other_hh_id";

const WRITE_METHODS = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];

type Fn = ReturnType<typeof vi.fn>;
type Model = Record<string, Fn>;

const h = vi.hoisted(() => {
  const models = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  const rawClient: Record<string, unknown> = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  const prisma = new Proxy(rawClient, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      let model = models.get(prop);
      if (!model) {
        model = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
          get(m, method: string) {
            if (!(method in m)) {
              // 기본값: 아무것도 없음. 테스트가 필요한 것만 덮어쓴다.
              const impl = async () => {
                if (method === "findMany") return [];
                if (method === "count") return 0;
                if (method.startsWith("update") || method.startsWith("delete")) return { count: 0 };
                return null;
              };
              m[method] = vi.fn(impl);
            }
            return m[method];
          },
        });
        models.set(prop, model);
      }
      return model;
    },
  });
  return {
    models,
    prisma,
    rawClient,
    getUploadSession: vi.fn(),
    deleteUploadSession: vi.fn(),
  };
});

vi.mock("../lib/prisma.js", () => ({ prisma: h.prisma }));
vi.mock("../lib/uploadSessions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/uploadSessions.js")>()),
  getUploadSession: h.getUploadSession,
  deleteUploadSession: h.deleteUploadSession,
}));

function db(model: string): Model {
  return (h.prisma as unknown as Record<string, Model>)[model];
}

/** 모든 mock을 되돌리고 "아무것도 없음" 기본값을 건다. 가구 A의 OWNER만 존재한다. */
function resetDefaults(): void {
  // mockReset은 vi.fn(impl)에 준 기본 구현으로 되돌린다
  for (const model of h.models.values()) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  h.getUploadSession.mockReset();
  h.deleteUploadSession.mockReset();
  (h.rawClient.$transaction as Fn).mockReset();
  (h.rawClient.$transaction as Fn).mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.prisma));
  db("householdMember").findFirst.mockResolvedValue({ householdId: HH_A, role: "OWNER" });
  db("user").findUnique.mockResolvedValue({ tokenVersion: 1 });
}

type Row = {
  name: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  payload?: unknown;
  /** 기본 404 */
  status?: number;
  body?: unknown;
  setup?: () => void;
  /** 이 조회가 가구 조건을 달고 나갔는지 */
  query?: { model: string; method: string; where: Record<string, unknown> };
  extra?: () => void;
};

const COURSE = `/api/care/medication-courses/${OTHER}`;

const rows: Row[] = [
  // --- products
  {
    name: "GET /api/products/:id",
    method: "GET",
    url: `/api/products/${OTHER}`,
    query: { model: "product", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "PATCH /api/products/:id",
    method: "PATCH",
    url: `/api/products/${OTHER}`,
    payload: { name: "x" },
    query: { model: "product", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "DELETE /api/products/:id",
    method: "DELETE",
    url: `/api/products/${OTHER}`,
    query: { model: "product", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "POST /api/products/:id/restore",
    method: "POST",
    url: `/api/products/${OTHER}/restore`,
    query: { model: "product", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "GET /api/products/:id/photos",
    method: "GET",
    url: `/api/products/${OTHER}/photos`,
    query: { model: "product", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("productPhoto").findMany).not.toHaveBeenCalled(),
  },
  {
    name: "POST /api/products/:id/photos",
    method: "POST",
    url: `/api/products/${OTHER}/photos`,
    query: { model: "product", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "GET /api/products/:id/photo",
    method: "GET",
    url: `/api/products/${OTHER}/photo`,
    query: { model: "product", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "GET /api/products/:id/photos/:photoId",
    method: "GET",
    url: `/api/products/${OTHER}/photos/photo_x`,
    query: {
      model: "productPhoto",
      method: "findFirst",
      where: { id: "photo_x", productId: OTHER, product: { householdId: HH_A } },
    },
  },
  {
    name: "POST /api/products/:id/photos/:photoId/primary",
    method: "POST",
    url: `/api/products/${OTHER}/photos/photo_x/primary`,
    query: {
      model: "productPhoto",
      method: "findFirst",
      where: { id: "photo_x", productId: OTHER, product: { householdId: HH_A } },
    },
  },
  {
    name: "DELETE /api/products/:id/photos/:photoId",
    method: "DELETE",
    url: `/api/products/${OTHER}/photos/photo_x`,
    query: {
      model: "productPhoto",
      method: "findFirst",
      where: { id: "photo_x", productId: OTHER, product: { householdId: HH_A } },
    },
  },

  // --- care / medication-courses
  {
    name: "GET /api/care/medication-courses?petId=남의 펫",
    method: "GET",
    url: `/api/care/medication-courses?petId=${OTHER}`,
    query: { model: "pet", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("medicationCourse").findMany).not.toHaveBeenCalled(),
  },
  {
    name: "GET /api/care/medication-courses/:id",
    method: "GET",
    url: COURSE,
    query: { model: "medicationCourse", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "PATCH /api/care/medication-courses/:id",
    method: "PATCH",
    url: COURSE,
    payload: { name: "x" },
    query: { model: "medicationCourse", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "DELETE /api/care/medication-courses/:id",
    method: "DELETE",
    url: COURSE,
    query: { model: "medicationCourse", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "POST /api/care/medication-courses (continuesCourseId가 남의 처방)",
    method: "POST",
    url: "/api/care/medication-courses",
    payload: { petId: "pet_a", name: "약", continuesCourseId: OTHER },
    setup: () => db("pet").findFirst.mockResolvedValue({ id: "pet_a" }),
    query: {
      model: "medicationCourse",
      method: "findFirst",
      where: { id: OTHER, householdId: HH_A, petId: "pet_a" },
    },
  },
  {
    name: "POST /api/care/medication-courses (남의 펫)",
    method: "POST",
    url: "/api/care/medication-courses",
    payload: { petId: OTHER, name: "약" },
    query: { model: "pet", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "POST /api/care/medication-courses/:id/doses",
    method: "POST",
    url: `${COURSE}/doses`,
    payload: {},
    query: { model: "medicationCourse", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "DELETE /api/care/medication-courses/:id/doses/latest",
    method: "DELETE",
    url: `${COURSE}/doses/latest`,
    query: { model: "medicationCourse", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("event").findFirst).not.toHaveBeenCalled(),
  },

  // --- 청크 업로드 세션: 다른 가구의 세션 id는 없는 것과 같다
  ...(["GET", "POST", "DELETE"] as const).map((method): Row => ({
    name: `${method} /api/attachments/uploads/:uploadId${method === "POST" ? "/complete" : ""}`,
    method,
    url: `/api/attachments/uploads/up_other${method === "POST" ? "/complete" : ""}`,
    setup: () =>
      h.getUploadSession.mockResolvedValue({
        id: "up_other",
        eventId: "event_other",
        householdId: "household_b",
        filename: "a.jpg",
        mimeType: "image/jpeg",
        totalSize: 5,
        receivedBytes: 5,
        nextChunkIndex: 1,
        tempPath: "/nonexistent/up_other.part",
        createdAt: Date.now(),
      }),
    extra: () => {
      expect(h.getUploadSession).toHaveBeenCalledWith("up_other");
      expect(h.deleteUploadSession).not.toHaveBeenCalled();
      expect(db("event").findFirst).not.toHaveBeenCalled();
    },
  })),

  // --- 포스터 상태: 남의 첨부 id는 목록에서 빠진다
  {
    name: "GET /api/attachments/posters",
    method: "GET",
    url: "/api/attachments/posters?ids=att_other,att_other2",
    status: 200,
    body: [],
    query: {
      model: "attachment",
      method: "findMany",
      where: { id: { in: ["att_other", "att_other2"] }, event: expect.objectContaining({ householdId: HH_A }) },
    },
  },

  // --- API 토큰
  {
    name: "GET /api/tokens",
    method: "GET",
    url: "/api/tokens",
    status: 200,
    body: [],
    query: { model: "apiToken", method: "findMany", where: { householdId: HH_A } },
  },
  {
    name: "DELETE /api/tokens/:id",
    method: "DELETE",
    url: `/api/tokens/${OTHER}`,
    setup: () => {
      db("apiToken").update.mockImplementation(async () => {
        const { Prisma } = await import("@prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "test",
        });
      });
    },
    query: { model: "apiToken", method: "update", where: { id: OTHER, householdId: HH_A } },
  },
  {
    name: "POST /api/tokens (남의 펫)",
    method: "POST",
    url: "/api/tokens",
    payload: { name: "t", petId: OTHER },
    query: { model: "pet", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("apiToken").create).not.toHaveBeenCalled(),
  },
  {
    name: "POST /api/tokens (남의 프리셋)",
    method: "POST",
    url: "/api/tokens",
    payload: { name: "t", presetId: OTHER },
    query: { model: "preset", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("apiToken").create).not.toHaveBeenCalled(),
  },

  // --- 기록 화면 보조 조회: 남의 펫이면 계산 없이 404
  {
    name: "GET /api/events/history-periods",
    method: "GET",
    url: `/api/events/history-periods?petId=${OTHER}`,
    query: { model: "pet", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("event").findMany).not.toHaveBeenCalled(),
  },
  {
    name: "GET /api/events/product-suggestions",
    method: "GET",
    url: `/api/events/product-suggestions?petId=${OTHER}&eventTypeKey=meal`,
    query: { model: "pet", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("event").findMany).not.toHaveBeenCalled(),
  },
  {
    name: "GET /api/events/clinic-suggestions",
    method: "GET",
    url: `/api/events/clinic-suggestions?petId=${OTHER}`,
    query: { model: "pet", method: "findFirst", where: { id: OTHER, householdId: HH_A } },
    extra: () => expect(db("event").findMany).not.toHaveBeenCalled(),
  },
];

describe("household isolation table (K-3)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    invalidateHouseholdCache(USER_A);
    invalidateTokenVersionCache(USER_A);
    app = await buildApp({ logger: false });
    resetDefaults();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(rows)("$name", async (row) => {
    row.setup?.();

    const res = await app.inject({
      method: row.method,
      url: row.url,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: USER_A, role: "ADMIN", tv: 1 }, { expiresIn: "1h" })}`,
      },
      ...(row.payload !== undefined ? { payload: row.payload as Record<string, unknown> } : {}),
    });

    expect(res.statusCode).toBe(row.status ?? 404);
    if (row.body !== undefined) expect(res.json()).toEqual(row.body);

    if (row.query) {
      expect(db(row.query.model)[row.query.method]).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining(row.query.where) }),
      );
    }
    row.extra?.();

    // 어떤 모델에도 쓰기가 일어나지 않았다
    for (const [name, model] of h.models) {
      for (const method of WRITE_METHODS) {
        const fn = model[method];
        // update는 토큰 폐기 시도 자체가 쓰기 호출이므로 where만 위에서 확인한다
        if (name === "apiToken" && method === "update") continue;
        if (fn) expect(fn, `${name}.${method}`).not.toHaveBeenCalled();
      }
    }
  });
});
