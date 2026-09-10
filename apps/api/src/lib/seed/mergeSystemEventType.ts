import type { Prisma, PrismaClient } from "@prisma/client";

type MergeOptions = {
  fromKey: string;
  toKey: string;
  /**
   * `toKey`가 아직 없을 때 `fromKey` 행을 **제자리에서** 이 값으로 바꾼다 (id 유지 — 이벤트·프리셋
   * 연결이 그대로다). 없으면 `toKey`가 없을 때 아무것도 하지 않는다.
   */
  rename?: Prisma.EventTypeUpdateInput;
  /** 옮기는 이벤트의 `productName` 앞에 붙일 태그 slug (예: 양치 → 관리 + `dental`) */
  eventTag?: string;
};

function withTag(tag: string, productName: string | null): string {
  const rest = productName?.trim();
  return rest ? `${tag},${rest}` : tag;
}

type AliasClient = Pick<PrismaClient, "eventTypeAlias">;

/** 가구별 파싱 별칭은 key 문자열로 묶여 있다 — 같이 옮기고, 이미 있으면 합친다. */
async function moveHouseholdAliases(db: AliasClient, fromKey: string, toKey: string): Promise<void> {
  const rows = await db.eventTypeAlias.findMany({ where: { eventTypeKey: fromKey } });
  for (const row of rows) {
    const target = await db.eventTypeAlias.findFirst({
      where: { householdId: row.householdId, eventTypeKey: toKey },
    });
    if (target) {
      await db.eventTypeAlias.update({
        where: { id: target.id },
        data: { aliases: Array.from(new Set([...target.aliases, ...row.aliases])) },
      });
      await db.eventTypeAlias.delete({ where: { id: row.id } });
    } else {
      await db.eventTypeAlias.update({ where: { id: row.id }, data: { eventTypeKey: toKey } });
    }
  }
}

/**
 * 시스템 EventType `fromKey`를 `toKey`로 합친다 — 이벤트·프리셋·리마인더·토큰 연결을 유지한다.
 *
 * - `toKey`가 없고 `rename`이 있으면 `fromKey` 행을 제자리에서 고친다
 * - 둘 다 있으면 `fromKey`의 연결을 전부 `toKey`로 옮기고 `fromKey`를 보관(archive)한다
 * - 프리셋은 같은 (household, pet, toKey) 활성 행이 이미 있으면 보관, 없으면 옮기고 시드 라벨을 바꾼다
 * - 가구별 파싱 별칭(`EventTypeAlias`)도 key를 따라 옮긴다
 */
export async function mergeSystemEventType(
  prisma: PrismaClient,
  { fromKey, toKey, rename, eventTag }: MergeOptions,
): Promise<void> {
  const [from, to] = await Promise.all([
    prisma.eventType.findFirst({ where: { householdId: null, key: fromKey, archivedAt: null } }),
    prisma.eventType.findFirst({ where: { householdId: null, key: toKey, archivedAt: null } }),
  ]);

  const fromLabel = `eventType.${fromKey}`;
  const toLabel = `eventType.${toKey}`;

  if (!from) return;

  if (!to) {
    if (!rename) return;
    await prisma.eventType.update({ where: { id: from.id }, data: rename });
    await prisma.preset.updateMany({
      where: { eventTypeId: from.id, label: fromLabel },
      data: { label: toLabel },
    });
    await moveHouseholdAliases(prisma, fromKey, toKey);
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (eventTag) {
      const tagged = await tx.event.findMany({
        where: { eventTypeId: from.id, productName: { not: null } },
        select: { id: true, productName: true },
      });
      for (const event of tagged) {
        await tx.event.update({
          where: { id: event.id },
          data: { eventTypeId: to.id, productName: withTag(eventTag, event.productName) },
        });
      }
      await tx.event.updateMany({
        where: { eventTypeId: from.id },
        data: { eventTypeId: to.id, productName: eventTag },
      });
    } else {
      await tx.event.updateMany({
        where: { eventTypeId: from.id },
        data: { eventTypeId: to.id },
      });
    }

    const presets = await tx.preset.findMany({
      where: { eventTypeId: from.id, archivedAt: null },
    });

    for (const preset of presets) {
      const duplicate = await tx.preset.findFirst({
        where: {
          householdId: preset.householdId,
          petId: preset.petId,
          eventTypeId: to.id,
          archivedAt: null,
        },
      });

      if (duplicate) {
        await tx.preset.update({
          where: { id: preset.id },
          data: { archivedAt: new Date() },
        });
        continue;
      }

      await tx.preset.update({
        where: { id: preset.id },
        data: {
          eventTypeId: to.id,
          label: preset.label === fromLabel ? toLabel : preset.label,
        },
      });
    }

    await tx.reminder.updateMany({
      where: { eventTypeId: from.id },
      data: { eventTypeId: to.id },
    });

    await tx.apiToken.updateMany({
      where: { eventTypeId: from.id },
      data: { eventTypeId: to.id },
    });

    await moveHouseholdAliases(tx, fromKey, toKey);

    await tx.eventType.update({
      where: { id: from.id },
      data: { archivedAt: new Date() },
    });
  });
}
