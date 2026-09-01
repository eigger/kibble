import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "kibble — 반려동물 일지",
    short_name: "kibble",
    description: "입력 마찰을 최소화하는 셀프호스트 반려동물 일지",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d5fa8",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "빠른 기록",
        short_name: "기록",
        description: "프리셋 칩으로 바로 기록 (/q)",
        url: "/q",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    categories: ["lifestyle", "utilities"],
  };
}
