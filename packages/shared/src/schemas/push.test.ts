import { describe, expect, it } from "vitest";
import { isSafePushEndpoint, pushSubscribeSchema } from "./push.js";

describe("isSafePushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (url) => {
    expect(isSafePushEndpoint(url)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/x",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://2130706433/x",
    "https://0x7f000001/x",
    "https://10.0.0.5/x",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
    "https://[fd00::1]/x",
    "https://postgres/x",
    "https://nas.local/x",
    "https://api.internal/x",
    "https://fcm.googleapis.com:8443/x",
    "https://user:pw@fcm.googleapis.com/x",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isSafePushEndpoint(url)).toBe(false);
  });

  it("is enforced by the subscribe schema", () => {
    const keys = { p256dh: "a", auth: "b" };
    expect(pushSubscribeSchema.safeParse({ endpoint: "https://10.0.0.5/x", keys }).success).toBe(false);
    expect(
      pushSubscribeSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys }).success,
    ).toBe(true);
  });
});
