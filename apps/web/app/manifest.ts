import type { MetadataRoute } from "next";

import { withBasePath } from "../lib/base-path";

// PWA manifest는 빌드 시점 정적 파일 — OS 설치 UI용 영문 기본값 (런타임 locale 미지원)
// start_url·아이콘·바로가기는 public/ 자산이라 Next가 basePath를 붙여주지 않는다.
// 서브패스 배포(Home Assistant Ingress 포함)에서 앱 밖을 가리키지 않도록 직접 붙인다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kibble — pet diary",
    short_name: "Kibble",
    description: "Self-hosted pet diary with minimal input friction",
    start_url: withBasePath("/"),
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#c47a2c",
    orientation: "portrait",
    icons: [
      { src: withBasePath("/icons/icon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: withBasePath("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBasePath("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBasePath("/icons/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Quick log",
        short_name: "Log",
        description: "Log with preset chips (/q)",
        url: withBasePath("/q/"),
        icons: [{ src: withBasePath("/icons/icon-192.png"), sizes: "192x192", type: "image/png" }],
      },
    ],
    categories: ["lifestyle", "utilities"],
  };
}
