import { describe, expect, it } from "vitest";
import { isSafePushEndpoint, pushSubscribeSchema } from "./push.js";

describe("isSafePushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://fcm.googleapis.com:443/x",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (url) => {
    expect(isSafePushEndpoint(url)).toBe(true);
  });

  // 각 줄이 다른 한 가지 조건만 어긴다 (다른 검사가 가려 주지 않도록)
  it.each([
    "http://fcm.googleapis.com/x", // scheme
    "https://fcm.googleapis.com:8443/x", // port
    "https://user:pw@fcm.googleapis.com/x", // credentials
    "https://localhost/x", // single label
    "https://localhost./x",
    "https://postgres/x",
    "https://nas.local/x", // private suffix
    "https://api.internal/x",
    "https://host.localdomain/x",
    "https://router.box/x",
    "https://127.0.0.1./x", // IP literal, trailing dot
    "https://0177.0.0.1/x", // octal
    "https://[::ffff:127.0.0.1]/x", // IPv4-mapped IPv6
    "https://[::ffff:7f00:1]/x",
    "https://127.1/x", // shorthand
    "https://127.0.0.1/x",
    "https://2130706433/x",
    "https://0x7f000001/x",
    "https://10.0.0.5/x",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
    "https://[fd00::1]/x",
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
