import path from "path";
import { chromium } from "playwright";

const USER_DATA_DIR = path.resolve("storage/shexpress-profile");

export async function openBrowser() {
  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    viewport: { width: 1366, height: 768 },
  });

  const page = browser.pages()[0] || (await browser.newPage());

  return { browser, page };
}
