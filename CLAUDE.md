# kibble — 에이전트 작업 지침

셀프호스트 반려동물 일지. **입력 마찰을 0에 가깝게** 만드는 것이 유일한 설계 목표.

---

## 시작하기 전에 반드시 읽을 것

| 문서 | 내용 |
|---|---|
| [`docs/WORKPLAN.md`](docs/WORKPLAN.md) | **작업 계획서 확정판.** 방향·WBS·규약(K-1~K-16)이 전부 여기 있다 |
| [`docs/WORKPLAN.md` §7](docs/WORKPLAN.md) | 확정된 결정과 근거. **다시 논의하지 말 것** |
| [`docs/WORKPLAN.md` §9](docs/WORKPLAN.md) | 작업 규약 K-1~K-16. 코드를 쓰기 전에 확인 |
| [`docs/scenarios.md`](docs/scenarios.md) | 입력 경로 비교 근거 |
| [`docs/WORKLOG.md`](docs/WORKLOG.md) | **작업 이력 + 기각된 안 목록.** §1을 먼저 읽어라 — 이미 검토하고 버린 안을 다시 제안하지 않기 위해서다 |
| [`docs/PROJECT.md`](docs/PROJECT.md) | 스펙. §4 데이터 모델은 확정판 |

**현재 상태: Phase 1 구현 완료 — 실사용 게이트 진행 중 (v0.1.0).**  
규약·WBS는 [`docs/WORKPLAN.md`](docs/WORKPLAN.md)를 따른다.

---

## 참조 저장소 — 로컬에 없으면 GitHub에서 본다

kibble은 아래 저장소들의 **검증된 섀시를 이식**해서 만든다 (`docs/WORKPLAN.md` §5.0). 작업 기기에 로컬 클론이 없을 수 있다 — **그럴 때는 GitHub에서 직접 읽는다. 추측하거나 건너뛰지 않는다.**

| 저장소 | 용도 | GitHub |
|---|---|---|
| **stash** | 섀시 전체(배포·인증·i18n·PWA·첨부). 가장 많이 참조한다 | `https://github.com/eigger/stash` |
| **garage** | 지도·내비·장소 검색, 주기 관리·리마인더 | `https://github.com/eigger/garage` |
| **drop** | PWA Web Share Target (SW가 POST를 가로채 IndexedDB로) | `https://github.com/eigger/drop` |

로컬 경로가 있으면 그쪽이 빠르다: `D:\Source\Github\{stash,garage,drop}`

없을 때 읽는 방법:

```bash
gh api repos/eigger/stash/contents/apps/api/src/routes/auth.ts --jq .content | base64 -d
```

파일을 여러 개 봐야 하면 얕은 클론이 낫다:

```bash
gh repo clone eigger/stash -- --depth 1
```

> **주의**: 참조 저장소의 코드를 **읽고 옮긴다** (K-6). 통째로 복사하지 않는다. stash에는 kibble에서 틀린 패턴이 있다 — 무인증 공개 라우트, URL 토큰, `Barcode.value` 전역 유니크(다중 테넌트에서 오류). `docs/WORKPLAN.md` §1.2 C등급 표를 먼저 확인할 것.

---

## 다중 기기 작업

작업은 여러 장소·여러 기기에서 진행되고 GitHub를 통해 공유된다.

1. **작업 시작 전 항상 `git pull`.** 다른 기기에서 밀어둔 커밋이 있을 수 있다
2. **작업 단위를 작게 끊어 push.** 기기를 옮길 때 미커밋 변경이 남으면 안 된다
3. **`docs/WORKPLAN.md`가 단일 진실 원천이다.** 결정이 바뀌면 코드보다 먼저 이 문서를 고치고 커밋한다 — 다른 기기의 세션은 이 문서만 읽고 이어받는다
4. 진행 상황은 `docs/WORKPLAN.md`의 WBS 티켓(P0-xx / P1-xx)으로 추적한다. 완료 항목은 표에 표시한다
5. 커밋 접두사: `feat:` / `fix:` / `chore:` / `docs:`

## 작업 기록 — 세션을 마칠 때 반드시 남긴다

세션이 여러 장소·여러 기기로 쪼개지므로, **기록하지 않으면 이어받는 쪽이 같은 논의를 반복한다.** 의미 있는 작업을 했다면 [`docs/WORKLOG.md`](docs/WORKLOG.md)에 추가한다.

**적을 것**

- 확정하거나 변경한 결정과 **그 근거**
- **기각한 안과 기각 사유** → `docs/WORKLOG.md §1` 표에 행을 추가한다. **회귀 방지의 핵심이다.** 재검토할 수 있는 안이라면 그 조건까지 적는다
- 리뷰·조사로 알아낸 사실 중 **계획을 바꾼 것**
- 다음 세션이 이어받을 미완 항목

**적지 않을 것**

- 파일별 변경 내역 — git이 한다
- 시도했다 버린 코드의 세부 — 결론만 §1에
- 개인 정보·실기록 인용 — **공개 저장소다**

**순서**: 결정이 바뀌면 `docs/WORKPLAN.md`를 **먼저** 고치고(단일 진실 원천), 그 다음 `docs/WORKLOG.md`에 이력을 남긴다. 스키마 결정이면 `docs/PROJECT.md` §4도 함께 고친다.

> `docs/WORKLOG.md`는 개발 기간 한정 문서다. **정식 릴리스 전에 삭제하거나 `CHANGELOG.md`로 정리**한다.

---

## 절대 규칙 (전문은 `docs/WORKPLAN.md` §9)

- **K-1** 모든 리소스 쿼리의 `where`에 `householdId`가 있다. 예외 없음
- **K-4** 이벤트 생성은 `createEvent()` 하나만 통과한다
- **K-5** 웹훅·토큰 엔드포인트를 만드는 커밋에 인증이 함께 들어간다
- **K-7** GET은 절대 쓰기를 하지 않는다
- **K-8** 프리셋·이벤트 타입 추가는 **데이터**다. 코드 변경이 필요하면 멈추고 모델을 재검토
- **K-9** UI 문자열은 ko/en을 **동시에** 추가한다
- **K-12** 거부당하는 입력이 없다. 파싱 실패는 `NOTE`로 흡수
- **K-13** 원문(`rawText`)을 버리지 않는다
- **K-16** 진단하지 않는다. "수의사 상담 권장"까지

## 공개 저장소다

처음부터 공개 전제로 만든다 (`docs/WORKPLAN.md` §7.2). 따라서:

- **개인 정보·개인 사용 패턴을 커밋하지 않는다.** 시드·픽스처·문서 예시는 일반값으로
- 외부 API 키는 `Setting`(DB)에 저장한다. `.env`나 코드에 넣지 않는다
- 릴리스 태그는 **Phase 1 게이트 통과 후**에만 발행한다
