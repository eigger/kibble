import { chromium } from "playwright-core";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

// kibble 빈 껍데기 화면을 docs/screenshots/{ko,en}/ 에 저장한다.
// 요구사항: API :8080, 웹 :3000, 데모 관리자 계정.
//   ADMIN_EMAIL / ADMIN_PASSWORD (기본 admin@example.com / changeme)
//   LOCALES=ko,en
//   CHROME_PATH (선택)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "../docs/screenshots");
const email = process.env.ADMIN_EMAIL || "admin@example.com";
const password = process.env.ADMIN_PASSWORD || "changeme";
const locales = (process.env.LOCALES || "ko,en").split(",").map((s) => s.trim()).filter(Boolean);

const PAGES = [
  { path: "/", file: "01-home.png" },
  { path: "/q", file: "02-quick-record.png" },
  { path: "/settings", file: "03-settings.png" },
];

async function waitReady(page) {
  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || "";
        return t.length > 0 && !t.includes("불러오는 중") && !t.includes("Loading");
      },
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
}

async function shot(page, filePath) {
  await waitReady(page);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log("saved", path.relative(OUT, filePath));
}

async function captureLocale(locale) {
  const dir = path.join(OUT, locale);
  await fs.mkdir(dir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    locale: locale === "en" ? "en-US" : "ko-KR",
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate((loc) => localStorage.setItem("kibble_locale", loc), locale);
  await page.reload({ waitUntil: "domcontentloaded" });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page
    .waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 })
    .catch(async () => console.log(`[${locale}] still on login:`, (await page.innerText("body")).slice(0, 160)));

  for (const { path: routePath, file } of PAGES) {
    await page.goto(`${BASE}${routePath}`, { waitUntil: "domcontentloaded" });
    await shot(page, path.join(dir, file));
  }

  await browser.close();
}

for (const locale of locales) {
  console.log("--- capturing", locale);
  await captureLocale(locale);
}
console.log("done");
