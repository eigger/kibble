import { describe, expect, it, vi } from "vitest";
import { migrateEnergyToObservation } from "./migrateEnergyToObservation.js";

function mockPrisma() {
  const energyId = "energy-id";
  const observationId = "observation-id";

  const eventType = {
    findFirst: vi.fn(async ({ where }: { where: { key?: string } }) => {
      if (where.key === "energy") {
        return { id: energyId, key: "energy", label: "eventType.energy" };
      }
      if (where.key === "observation") {
        return { id: observationId, key: "observation", label: "eventType.observation" };
      }
      return null;
    }),
    update: vi.fn(async () => ({})),
  };

  const preset = {
    findMany: vi.fn(async () => [
      { id: "preset-energy", householdId: "hh", petId: "pet", eventTypeId: energyId },
    ]),
    findFirst: vi.fn(async () => ({ id: "preset-observation" })),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };

  const event = { updateMany: vi.fn(async () => ({ count: 2 })) };
  const reminder = { updateMany: vi.fn(async () => ({ count: 0 })) };
  const apiToken = { updateMany: vi.fn(async () => ({ count: 0 })) };

  const tx = { eventType, preset, event, reminder, apiToken };
  const prisma = {
    eventType,
    preset,
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };

  return { prisma, tx, energyId, observationId };
}

describe("migrateEnergyToObservation", () => {
  it("renames energy when observation does not exist", async () => {
    const { prisma, energyId } = mockPrisma();
    prisma.eventType.findFirst = vi.fn(async ({ where }: { where: { key?: string } }) => {
      if (where.key === "energy") return { id: energyId, key: "energy" };
      return null;
    });

    await migrateEnergyToObservation(prisma as never);

    expect(prisma.eventType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: energyId },
        data: expect.objectContaining({ key: "observation" }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("merges and archives energy when observation already exists", async () => {
    const { prisma, tx, energyId, observationId } = mockPrisma();

    await migrateEnergyToObservation(prisma as never);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { eventTypeId: energyId },
      data: { eventTypeId: observationId },
    });
    expect(tx.eventType.update).toHaveBeenCalledWith({
      where: { id: energyId },
      data: { archivedAt: expect.any(Date) },
    });
    expect(tx.preset.update).toHaveBeenCalledWith({
      where: { id: "preset-energy" },
      data: { archivedAt: expect.any(Date) },
    });
  });
});
