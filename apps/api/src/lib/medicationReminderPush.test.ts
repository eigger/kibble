import { describe, expect, it } from "vitest";
import { pushCopy } from "./medicationReminderPush.js";

describe("pushCopy", () => {
  it("formats lead push notification in Korean", () => {
    const copy = pushCopy("lead", "ko", "초코", "항생제", "09:00");
    expect(copy.title).toBe("복약 시간이 다가왔어요");
    expect(copy.body).toContain("초코 · 항생제 ·");
  });

  it("formats lead push notification in English", () => {
    const copy = pushCopy("lead", "en", "Choco", "Antibiotics", "09:00");
    expect(copy.title).toBe("Medication soon");
    expect(copy.body).toContain("Choco · Antibiotics ·");
  });

  it("formats overdue push notification in Korean", () => {
    const copy = pushCopy("overdue", "ko", "초코", "심장사상충", "20:00");
    expect(copy.title).toBe("복약 기록이 없어요");
    expect(copy.body).toContain("초코 · 심장사상충 ·");
  });

  it("formats overdue push notification in English", () => {
    const copy = pushCopy("overdue", "en", "Choco", "Heartworm", "20:00");
    expect(copy.title).toBe("Medication overdue");
    expect(copy.body).toContain("Choco · Heartworm ·");
  });
});
