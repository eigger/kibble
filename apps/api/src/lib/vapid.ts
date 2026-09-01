import webpush from "web-push";
import { prisma } from "./prisma.js";

const VAPID_PUBLIC = "VAPID_PUBLIC_KEY";
const VAPID_PRIVATE = "VAPID_PRIVATE_KEY";

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
};

export async function getVapidKeys(): Promise<VapidKeys | null> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [VAPID_PUBLIC, VAPID_PRIVATE] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const publicKey = byKey.get(VAPID_PUBLIC) ?? process.env.VAPID_PUBLIC_KEY ?? null;
  const privateKey = byKey.get(VAPID_PRIVATE) ?? process.env.VAPID_PRIVATE_KEY ?? null;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

export async function generateAndStoreVapidKeys(): Promise<{ publicKey: string }> {
  const keys = webpush.generateVAPIDKeys();
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: VAPID_PUBLIC },
      create: { key: VAPID_PUBLIC, value: keys.publicKey },
      update: { value: keys.publicKey },
    }),
    prisma.setting.upsert({
      where: { key: VAPID_PRIVATE },
      create: { key: VAPID_PRIVATE, value: keys.privateKey },
      update: { value: keys.privateKey },
    }),
  ]);
  return { publicKey: keys.publicKey };
}

export async function configureWebPush(): Promise<boolean> {
  const keys = await getVapidKeys();
  if (!keys) return false;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@localhost";
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return true;
}
