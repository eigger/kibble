/**
 * 백업 내보내기 티켓 판정.
 *
 * 예전에는 세 가지 서로 다른 실패가 전부 같은 `{"error":"unauthorized"}`로 나갔다.
 * 티켓이 아예 안 왔는지, 서명이 안 맞는지(만료 포함), 이미 쓴 티켓인지를 가릴 수
 * 없어서 "백업 누르면 unauthorized"라는 신고에서 다음 한 걸음을 못 뗐다.
 *
 * 라우트에서 떼어낸 이유는 서버 없이 검사할 수 있게 하기 위해서다 — 통합 테스트는
 * app.inject()로 정상 경로만 밟고, 정작 실기에서 터진 건 실패 경로였다.
 */

export type BackupTicketPayload = { purpose?: string; jti?: string; jobId?: string };

export type BackupTicketReason =
  /** 쿼리에 ticket 자체가 없다 — 링크가 잘렸거나 프록시가 쿼리를 떨궜다 */
  | "missing_ticket"
  /** 서명 불일치·만료·형식 오류. 60초 TTL을 넘겨 눌렀을 때가 여기다 */
  | "invalid_ticket"
  /** purpose가 backup이 아니다 — 로그인 토큰을 붙여 부른 경우 */
  | "wrong_purpose"
  /** 한 번 쓴 티켓. 브라우저 다운로드 관리자의 재요청·탭 새로고침이 여기로 온다 */
  | "ticket_already_used";

export type BackupTicketResult =
  /** jobId는 미리 만들어 둔 아카이브를 가리킨다. 티켓이 유효해도 그 작업이 없거나
   *  아직 안 끝났을 수 있으므로, 그 판단은 라우트가 한다 */
  | { ok: true; jti: string; jobId?: string }
  | { ok: false; reason: BackupTicketReason };

export function classifyBackupTicket(input: {
  ticket: unknown;
  verify: (token: string) => BackupTicketPayload;
  isUsed: (jti: string) => boolean;
}): BackupTicketResult {
  const { ticket, verify, isUsed } = input;
  if (typeof ticket !== "string" || ticket.length === 0) {
    return { ok: false, reason: "missing_ticket" };
  }

  let decoded: BackupTicketPayload;
  try {
    decoded = verify(ticket);
  } catch {
    return { ok: false, reason: "invalid_ticket" };
  }

  if (decoded.purpose !== "backup") return { ok: false, reason: "wrong_purpose" };
  if (typeof decoded.jti !== "string" || !decoded.jti) {
    return { ok: false, reason: "invalid_ticket" };
  }
  if (isUsed(decoded.jti)) return { ok: false, reason: "ticket_already_used" };

  return { ok: true, jti: decoded.jti, jobId: decoded.jobId };
}
