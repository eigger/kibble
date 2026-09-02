import { z } from "zod";

// garage는 osm/kakao/naver/tmap 4종을 지원하지만 kibble의 지도는 "병원 한 곳"을 보여주는
// 용도뿐이다. 프로바이더를 늘리면 leaflet 의존과 다크 타일 분기가 따라온다 — 카카오만 붙인다.
// 내비 딥링크는 SDK 키가 필요 없으므로 T맵·카카오·네이버 3종을 그대로 유지한다.
export const mapProviderSchema = z.enum(["kakao"]);
export type MapProvider = z.infer<typeof mapProviderSchema>;

/** 좌표 검증 — 이벤트 스키마와 Contact 저장 양쪽이 같은 범위를 쓴다. */
export const latitudeSchema = z.coerce.number().finite().min(-90).max(90);
export const longitudeSchema = z.coerce.number().finite().min(-180).max(180);
