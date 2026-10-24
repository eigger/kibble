import { describe, expect, it } from "vitest";
import { rateLimitIp } from "./rateLimitIp.js";

describe("rateLimitIp", () => {
  it("keeps IPv4 as is", () => {
    expect(rateLimitIp("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitIp("::ffff:203.0.113.7")).toBe("::ffff:203.0.113.7");
  });
  it("buckets IPv6 by /64", () => {
    const a = rateLimitIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(a).toBe(rateLimitIp("2001:0db8:0001:0002::1"));
    expect(a).not.toBe(rateLimitIp("2001:db8:1:3::1"));
    expect(rateLimitIp("2001:db8::1")).toBe(rateLimitIp("2001:db8:0:0:5::9"));
    expect(rateLimitIp("::1")).toBe("0:0:0:0::/64");
  });
});
