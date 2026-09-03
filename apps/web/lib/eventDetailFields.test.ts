import { describe, expect, it } from "vitest";
import {
  eventDetailFields,
  formatEventDetailLine,
  resolveEventUnit,
} from "./eventDetailFields";

describe("eventDetailFields", () => {
  it("poop shows fecal scale only", () => {
    const f = eventDetailFields("poop", "FECAL_7");
    expect(f.fecalScale).toBe(true);
    expect(f.quantity).toBe(false);
    expect(f.quantityOffered).toBe(false);
  });

  it("meal shows offered and consumed with product name", () => {
    const f = eventDetailFields("meal", null);
    expect(f.productName).toBe(true);
    expect(f.quantityOffered).toBe(true);
    expect(f.quantity).toBe(true);
    expect(f.showUnitInput).toBe(true);
    expect(f.defaultUnit).toBe("g");
    expect(f.note).toBe(true);
    expect(f.noteLabelKey).toBe("eventDetailNote");
  });

  it("weight uses kg and weight label", () => {
    const f = eventDetailFields("weight", null);
    expect(f.quantity).toBe(true);
    expect(f.showUnitInput).toBe(false);
    expect(f.defaultUnit).toBe("kg");
    expect(f.quantityLabelKey).toBe("eventDetailWeight");
  });

  it("water uses ml without unit input", () => {
    const f = eventDetailFields("water", null);
    expect(f.quantityLabelKey).toBe("eventDetailVolume");
    expect(f.defaultUnit).toBe("ml");
    expect(f.showUnitInput).toBe(false);
  });

  it("pee shows urine amount scale", () => {
    const f = eventDetailFields("pee", "URINE_AMOUNT_3");
    expect(f.scale3).toBe(true);
    expect(f.note).toBe(true);
    expect(f.quantity).toBe(false);
    expect(f.fecalScale).toBe(false);
  });

  it("observation combines signs, vitality scale, and note", () => {
    const f = eventDetailFields("observation", "ENERGY_3");
    expect(f.scale3).toBe(true);
    expect(f.detailTags).toBe(true);
    expect(f.productCustomInput).toBe(false);
    expect(f.noteLabelKey).toBe("eventDetailNote");
  });

  it("legacy energy key still maps to observation fields", () => {
    const f = eventDetailFields("energy", "ENERGY_3");
    expect(f.detailTags).toBe(true);
    expect(f.scale3).toBe(true);
  });

  it("treat and legacy supplement show product name", () => {
    const treat = eventDetailFields("treat", null);
    expect(treat.productName).toBe(true);
    expect(treat.quantityOffered).toBe(false);
    const legacy = eventDetailFields("supplement", null);
    expect(legacy.productName).toBe(true);
    expect(legacy.quantityOffered).toBe(false);
  });

  it("vomit shows tag-capable subtype field", () => {
    const f = eventDetailFields("vomit", null);
    expect(f.productName).toBe(true);
    expect(f.detailTags).toBe(true);
    expect(f.productNameLabelKey).toBe("eventDetailVomitKind");
    expect(f.quantity).toBe(false);
  });

  it("resolves tag slug in detail line", () => {
    const line = formatEventDetailLine(
      {
        productName: "chicken,tuna",
        quantity: null,
        quantityOffered: null,
        unit: null,
        scaleValue: null,
        note: null,
        eventType: { key: "meal", scaleType: null },
      },
      (key) =>
        (
          {
            "eventTag.meal.chicken": "닭고기",
            "eventTag.meal.tuna": "참치",
          } as Record<string, string>
        )[key] ?? key,
    );
    expect(line).toBe("닭고기 · 참치");
  });

  it("grooming is note-only", () => {
    const f = eventDetailFields("grooming", null);
    expect(f.note).toBe(true);
    expect(f.quantity).toBe(false);
  });

  it("vet_visit shows clinic name, address, and cost", () => {
    const f = eventDetailFields("vet_visit", null);
    expect(f.clinicName).toBe(true);
    expect(f.clinicAddress).toBe(true);
    expect(f.cost).toBe(true);
    expect(f.note).toBe(true);
    expect(f.productName).toBe(false);
  });
});

describe("resolveEventUnit", () => {
  it("applies default kg for weight", () => {
    const fields = eventDetailFields("weight", null);
    expect(resolveEventUnit(fields, "")).toBe("kg");
  });
});

describe("formatEventDetailLine", () => {
  it("does not show meal quantities on poop", () => {
    const line = formatEventDetailLine({
      quantity: 30,
      quantityOffered: 100,
      unit: "g",
      scaleValue: 4,
      note: null,
      eventType: { key: "poop", scaleType: "FECAL_7" },
    });
    expect(line).toBe("4/7");
  });

  it("treat shows product name without offered quantity", () => {
    const f = eventDetailFields("treat", null);
    expect(f.productName).toBe(true);
    expect(f.quantityOffered).toBe(false);
    expect(f.quantity).toBe(true);
  });

  it("shows product name in detail line", () => {
    const line = formatEventDetailLine({
      productName: "로얄캐닌",
      quantity: 30,
      quantityOffered: 100,
      unit: "g",
      scaleValue: null,
      note: null,
      eventType: { key: "meal", scaleType: null },
    });
    expect(line).toBe("로얄캐닌 · 100g / 30g");
  });

  it("shows weight with default unit", () => {
    const line = formatEventDetailLine({
      quantity: 4.2,
      quantityOffered: null,
      unit: null,
      scaleValue: null,
      note: null,
      eventType: { key: "weight", scaleType: null },
    });
    expect(line).toBe("4.2kg");
  });

  // 목록 한 줄은 병원 이름까지 — 주소는 상세 시트가 따로 보여준다.
  it("shows the clinic name but not the address for vet visit", () => {
    const line = formatEventDetailLine({
      clinicName: "행복동물병원",
      clinicAddress: "강남구",
      quantity: null,
      quantityOffered: null,
      unit: null,
      scaleValue: null,
      note: null,
      eventType: { key: "vet_visit", scaleType: null },
    });
    expect(line).toBe("행복동물병원");
  });

  it("shows cost for vet visit", () => {
    const line = formatEventDetailLine({
      clinicName: "행복동물병원",
      costKrw: 35000,
      quantity: null,
      quantityOffered: null,
      unit: null,
      scaleValue: null,
      note: null,
      eventType: { key: "vet_visit", scaleType: null },
    });
    expect(line).toBe("행복동물병원 · 35,000원");
  });

  it("shows medication course name in detail line", () => {
    const line = formatEventDetailLine({
      medicationCourseName: "○○ 캡슐",
      quantity: null,
      quantityOffered: null,
      unit: null,
      scaleValue: null,
      note: null,
      eventType: { key: "medication", scaleType: null },
    });
    expect(line).toBe("○○ 캡슐");
  });

  it("shows urine amount label in detail line", () => {
    const t = (key: string) =>
      ({ "eventDetailUrineAmount.3": "많음" } as Record<string, string>)[key] ?? key;
    const line = formatEventDetailLine(
      {
        quantity: null,
        quantityOffered: null,
        unit: null,
        scaleValue: 3,
        note: null,
        eventType: { key: "pee", scaleType: "URINE_AMOUNT_3" },
      },
      t,
    );
    expect(line).toBe("많음");
  });

  it("shows vitality label in observation detail line", () => {
    const t = (key: string) =>
      (
        {
          "eventDetailEnergy.2": "보통",
          "eventTag.observation.eye_discharge": "눈꼽",
        } as Record<string, string>
      )[key] ?? key;
    const line = formatEventDetailLine(
      {
        productName: "eye_discharge",
        quantity: null,
        quantityOffered: null,
        unit: null,
        scaleValue: 2,
        note: "왼쪽만",
        eventType: { key: "observation", scaleType: "ENERGY_3" },
      },
      t,
    );
    expect(line).toBe("눈꼽 · 보통 · 왼쪽만");
  });
});
