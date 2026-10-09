/**
 * 태그 타입 중 등록 제품(`productId`)만 잇는 타입 — 관리는 위생용품(모래·샴푸·치약)을,
 * 체온은 체온계(DEVICE)를 단다. 서버(자주 쓰는 이름)와 웹(루틴 시트)이 같은 목록을 본다.
 */
export const PRODUCT_LINK_ONLY_EVENT_KEYS: ReadonlySet<string> = new Set(["care", "temperature"]);

/** 태그 타입의 `productName`은 slug CSV다 — 관찰 태그를 많이 고르면 120자를 넘는다 */
export const PRODUCT_NAME_MAX = 500;
