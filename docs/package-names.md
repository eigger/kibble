# 저장소·패키지명 충돌 조사 (P0-06)

- 작성일: 2026-08-31
- 결론: **현재 명명으로 진행 가능.** 루트 npm 패키지명 `kibble`은 외부 패키지와 이름만 겹치며, `private: true` monorepo라 publish 충돌 없음.

---

## GitHub

| 이름 | 상태 |
|---|---|
| `eigger/kibble` | **본 저장소** (public, MIT) |
| `apache/kibble` | Apache Kibble (소프트웨어 분석 도구) — **다른 프로젝트**, 충돌 아님 |
| 기타 `*kibble*` | 무관 |

## npm

| 패키지 | 상태 | 대응 |
|---|---|---|
| `kibble@1.2.1` | 존재 ("Useful JavaScript utilities", 구형) | 루트 `package.json`은 **`"private": true`** (stash와 동일). npm publish 안 함 |
| `@kibble/shared` | **404 — 사용 가능** | workspace 이름으로 채택 |
| `@kibble/api` | **404 — 사용 가능** | |
| `@kibble/web` | **404 — 사용 가능** | |

## GHCR / Docker (P1-02 예정)

stash 패턴: `ghcr.io/<owner>/kibble-api`, `kibble-web`. `stash-api`와 병행 가능.

## PostgreSQL / Compose 기본값 (P1-02)

stash 기본 `POSTGRES_DB=stash` → kibble은 **`kibble`** 로 치환 (§5.0 이름 치환표).

---

## 리뷰

- [x] GitHub repo명 확정
- [x] npm scope `@kibble/*` 가용
- [ ] `@kibble` npm organization 선점 — **선택**. publish 계획 없으면 불필요
