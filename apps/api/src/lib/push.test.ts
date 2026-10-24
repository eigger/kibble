import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("web-push", () => ({ default: { sendNotification: send } }));
vi.mock("./vapid.js", () => ({ configureWebPush: vi.fn(async () => true) }));
const deleteMany = vi.hoisted(() => vi.fn());
vi.mock("./prisma.js", () => ({ prisma: { pushSubscription: { deleteMany } } }));

import { sendPushToSubscription } from "./push.js";

const sub = (endpoint: string) => ({ id: "s1", endpoint, p256dh: "k", auth: "a" });

describe("sendPushToSubscription — 발송 시점 endpoint 재검사", () => {
  beforeEach(() => {
    send.mockClear();
    deleteMany.mockClear();
  });

  it("never POSTs to an internal address", async () => {
    expect(await sendPushToSubscription(sub("https://169.254.169.254/x"), { title: "t", body: "b" })).toBe(false);
    expect(await sendPushToSubscription(sub("http://fcm.googleapis.com/x"), { title: "t", body: "b" })).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("sends to a normal push service", async () => {
    expect(await sendPushToSubscription(sub("https://fcm.googleapis.com/fcm/send/a"), { title: "t", body: "b" })).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
