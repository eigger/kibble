import { describe, expect, it } from "vitest";
import { presetTemplatesForSpecies, selectPresetsToInsert } from "./presetTemplates.js";

describe("presetTemplatesForSpecies", () => {
  it("returns 7 templates for CAT and DOG", () => {
    expect(presetTemplatesForSpecies("CAT")).toHaveLength(7);
    expect(presetTemplatesForSpecies("DOG")).toHaveLength(7);
  });

  it("returns 6 templates for OTHER", () => {
    expect(presetTemplatesForSpecies("OTHER")).toHaveLength(6);
  });

  it("includes walk only in DOG presets", () => {
    const dogKeys = presetTemplatesForSpecies("DOG").map((t) => t.eventTypeKey);
    const catKeys = presetTemplatesForSpecies("CAT").map((t) => t.eventTypeKey);
    expect(dogKeys).toContain("walk");
    expect(catKeys).not.toContain("walk");
    // litter_change는 EventType만 종 특화 — CAT 프리셋 템플릿(§4.2)에는 없음
    expect(catKeys).not.toContain("litter_change");
  });
});

describe("selectPresetsToInsert", () => {
  const templates = presetTemplatesForSpecies("CAT");
  const eventTypeIdByKey = new Map(
    templates.map((t) => [t.eventTypeKey, `id-${t.eventTypeKey}`]),
  );

  it("inserts all templates on first pet", () => {
    const rows = selectPresetsToInsert(templates, eventTypeIdByKey, new Set(), true);
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.applyStarter)).toHaveLength(3);
  });

  it("skips existing event types on second pet", () => {
    const existing = new Set(["id-meal", "id-water", "id-poop", "id-pee", "id-treat", "id-vomit"]);
    const rows = selectPresetsToInsert(templates, eventTypeIdByKey, existing, false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventTypeKey).toBe("weight");
    expect(rows[0]?.applyStarter).toBe(false);
  });

  it("never sets isStarter on second pet even for new species-specific types", () => {
    const dogTemplates = presetTemplatesForSpecies("DOG");
    const dogIds = new Map(dogTemplates.map((t) => [t.eventTypeKey, `id-${t.eventTypeKey}`]));
    const existing = new Set(["id-meal", "id-water", "id-poop", "id-pee", "id-treat", "id-vomit"]);
    const rows = selectPresetsToInsert(dogTemplates, dogIds, existing, false);
    expect(rows.map((r) => r.eventTypeKey).sort()).toEqual(["walk", "weight"]);
    expect(rows.every((r) => !r.applyStarter)).toBe(true);
  });
});
