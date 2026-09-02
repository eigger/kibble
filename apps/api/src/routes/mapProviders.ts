import type { FastifyInstance } from "fastify";
import type { MapProvider } from "@kibble/shared";
import { getSetting } from "../lib/settings.js";

/**
 * 키가 없으면 providers가 비고, 웹은 검색·지도 UI를 아예 그리지 않는다 (WORKPLAN §3.9).
 * appKey는 브라우저 SDK가 그대로 쓰는 공개 키다 — 도메인 제한은 카카오 콘솔에서 건다.
 */
export async function mapProviderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/providers", async () => {
    const kakaoAppKey = (await getSetting("KAKAO_MAP_APP_KEY")) ?? null;
    const providers: MapProvider[] = kakaoAppKey ? ["kakao"] : [];
    return { providers, kakaoAppKey };
  });
}
