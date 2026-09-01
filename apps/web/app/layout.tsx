import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";
import { AuthProvider } from "../lib/auth-context";
import { ToastProvider } from "../lib/toast-context";
import { ThemeProvider } from "../lib/theme-context";
import { LocaleProvider } from "../lib/i18n/locale-context";
import { BottomNav } from "../components/BottomNav";
import { OfflineBanner } from "../components/OfflineBanner";
import { OfflineSync } from "../components/OfflineSync";

// 첫 페인트 전에 저장된 테마를 적용해서, React가 붙기 전까지 잠깐 시스템 테마로
// 보였다가 사용자가 고른 테마로 바뀌는 깜빡임을 막는다.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("kibble_theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}var a=localStorage.getItem("kibble_accent_color");if(a==="amber"||a==="terracotta"||a==="blue"||a==="sage"){document.documentElement.setAttribute("data-accent",a);}else{document.documentElement.setAttribute("data-accent","amber");}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "kibble",
  description: "Self-hosted pet diary with minimal input friction",
  appleWebApp: {
    capable: true,
    title: "kibble",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c47a2c" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <RegisterServiceWorker />
        <LocaleProvider>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <OfflineBanner />
                <OfflineSync />
                {children}
                <BottomNav />
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
