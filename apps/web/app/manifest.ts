import type { MetadataRoute } from "next";

// PWA manifest는 빌드 시점 정적 파일 — OS 설치 UI용 영문 기본값 (런타임 locale 미지원)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "kibble — pet diary",
    short_name: "kibble",
    description: "Self-hosted pet diary with minimal input friction",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#c47a2c",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Quick log",
        short_name: "Log",
        description: "Log with preset chips (/q)",
        url: "/q",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    categories: ["lifestyle", "utilities"],
  };
}
