import { describe, expect, it } from "vitest";
import { classifyBackupTicket } from "./backupTicket.js";

const never = () => false;
const always = () => true;

describe("classifyBackupTicket", () => {
  it("accepts a well-formed unused backup ticket", () => {
    const result = classifyBackupTicket({
      ticket: "t",
      verify: () => ({ purpose: "backup", jti: "abc" }),
      isUsed: never,
    });
    expect(result).toEqual({ ok: true, jti: "abc" });
  });

  // 아래 네 가지는 예전에 전부 같은 {"error":"unauthorized"}로 나갔다 — 실기에서
  // "unauthorized"라는 신고를 받아도 어느 쪽인지 가릴 수 없었던 게 이 지점이다.
  it("separates a missing ticket from a malformed one", () => {
    for (const ticket of [undefined, null, "", 123]) {
      expect(
        classifyBackupTicket({ ticket, verify: () => ({}), isUsed: never }),
      ).toEqual({ ok: false, reason: "missing_ticket" });
    }
  });

  it("reports an expired or badly signed ticket as invalid", () => {
    const result = classifyBackupTicket({
      ticket: "t",
      verify: () => {
        throw new Error("jwt expired");
      },
      isUsed: never,
    });
    expect(result).toEqual({ ok: false, reason: "invalid_ticket" });
  });

  it("rejects a login token used as a backup ticket", () => {
    const result = classifyBackupTicket({
      ticket: "t",
      verify: () => ({ jti: "abc" }),
      isUsed: never,
    });
    expect(result).toEqual({ ok: false, reason: "wrong_purpose" });
  });

  it("treats a ticket with no jti as invalid rather than usable", () => {
    const result = classifyBackupTicket({
      ticket: "t",
      verify: () => ({ purpose: "backup" }),
      isUsed: never,
    });
    expect(result).toEqual({ ok: false, reason: "invalid_ticket" });
  });

  // 브라우저 다운로드 관리자의 재요청·탭 새로고침이 여기로 온다.
  it("names a replayed ticket so a second request is distinguishable", () => {
    const result = classifyBackupTicket({
      ticket: "t",
      verify: () => ({ purpose: "backup", jti: "abc" }),
      isUsed: always,
    });
    expect(result).toEqual({ ok: false, reason: "ticket_already_used" });
  });
});
