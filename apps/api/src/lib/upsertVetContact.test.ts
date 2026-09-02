import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { upsertVetContact } from "./upsertVetContact.js";

type ContactRow = {
  id: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeUrl: string | null;
};

function fakeDb(existing: ContactRow | null) {
  const update = vi.fn(async () => ({}));
  const create = vi.fn(async () => ({ id: "new-contact" }));
  const findFirst = vi.fn(async () => existing);
  return {
    db: { contact: { findFirst, update, create } } as unknown as PrismaClient,
    findFirst,
    update,
    create,
  };
}

const NO_COORDS: ContactRow = {
  id: "c1",
  address: null,
  latitude: null,
  longitude: null,
  placeUrl: null,
};

describe("upsertVetContact", () => {
  it("가구 범위 안에서만 VET 연락처를 찾는다 (K-1)", async () => {
    const { db, findFirst } = fakeDb(NO_COORDS);
    await upsertVetContact(db, "hh1", "행복 동물병원");
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      householdId: "hh1",
      type: "VET",
      name: "행복 동물병원",
    });
  });

  it("새 병원은 좌표·상세 URL과 함께 만든다", async () => {
    const { db, create } = fakeDb(null);
    const id = await upsertVetContact(db, "hh1", "  행복 동물병원  ", {
      address: "서울시 강남구",
      latitude: 37.5,
      longitude: 127.03,
      placeUrl: "https://place.map.kakao.com/1",
    });
    expect(id).toBe("new-contact");
    expect(create.mock.calls[0][0].data).toMatchObject({
      householdId: "hh1",
      type: "VET",
      name: "행복 동물병원",
      address: "서울시 강남구",
      latitude: 37.5,
      longitude: 127.03,
      placeUrl: "https://place.map.kakao.com/1",
    });
  });

  it("기존 병원에 좌표가 새로 오면 채운다", async () => {
    const { db, update } = fakeDb(NO_COORDS);
    await upsertVetContact(db, "hh1", "행복 동물병원", {
      latitude: 37.5,
      longitude: 127.03,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toEqual({ latitude: 37.5, longitude: 127.03 });
  });

  // 병원은 재방문한다 — 검색 없이 이름만 다시 적었다고 좌표가 날아가면 안 된다.
  it("좌표 없는 재기록이 기존 좌표를 지우지 않는다", async () => {
    const { db, update } = fakeDb({
      id: "c1",
      address: "서울시 강남구",
      latitude: 37.5,
      longitude: 127.03,
      placeUrl: "https://place.map.kakao.com/1",
    });
    const id = await upsertVetContact(db, "hh1", "행복 동물병원", { address: "" });
    expect(id).toBe("c1");
    expect(update).not.toHaveBeenCalled();
  });

  it("이름이 비면 거부한다", async () => {
    const { db } = fakeDb(null);
    await expect(upsertVetContact(db, "hh1", "   ")).rejects.toThrow("CLINIC_NAME_REQUIRED");
  });
});
