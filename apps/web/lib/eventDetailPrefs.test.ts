import { beforeEach, describe, expect, it } from "vitest";
import { loadEventDetailPrefs, saveEventDetailPrefs } from "./eventDetailPrefs";

describe("eventDetailPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips prefs per pet and event type", () => {
    saveEventDetailPrefs("pet1", "meal", {
      productName: "chicken",
      quantity: "50",
      quantityOffered: "60",
      unit: "g",
    });
    expect(loadEventDetailPrefs("pet1", "meal")).toEqual({
      productName: "chicken",
      quantity: "50",
      quantityOffered: "60",
      unit: "g",
    });
    expect(loadEventDetailPrefs("pet1", "treat")).toBeNull();
    expect(loadEventDetailPrefs("pet2", "meal")).toBeNull();
  });
});
