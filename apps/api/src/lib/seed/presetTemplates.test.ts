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
    expect(catKeys).not.toContain("litter_change");
  });
});

describe("selectPresetsToInsert", () => {
  const templates = presetTemplatesForSpecies("CAT");
  const eventTypeIdByKey = new Map(
    templates.map((t) => [t.eventTypeKey, `id-${t.eventTypeKey}`]),
  );

  it("inserts all templates for first household pet with starters", () => {
    const rows = selectPresetsToInsert(templates, eventTypeIdByKey, new Set(), true);
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.applyStarter)).toHaveLength(3);
  });

  it("skips event types already on this pet (idempotent re-run)", () => {
    const existing = new Set(["id-meal", "id-water", "id-poop", "id-pee", "id-treat", "id-vomit"]);
    const rows = selectPresetsToInsert(templates, eventTypeIdByKey, existing, true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventTypeKey).toBe("weight");
  });

  it("creates full species set for second pet without starters", () => {
    const dogTemplates = presetTemplatesForSpecies("DOG");
    const dogIds = new Map(dogTemplates.map((t) => [t.eventTypeKey, `id-${t.eventTypeKey}`]));
    const rows = selectPresetsToInsert(dogTemplates, dogIds, new Set(), false);
    expect(rows).toHaveLength(7);
    expect(rows.some((r) => r.eventTypeKey === "walk")).toBe(true);
    expect(rows.every((r) => !r.applyStarter)).toBe(true);
  });
});
