import { openBrowser } from "./browser.js";

const LOGIN_URL = "https://shexpress.ma/is-admin/login.php";
const RAMASSAGE_URL = "https://shexpress.ma/is-admin/ramassage.php?world=0";

export async function ensureShexpressLogin() {
  const { browser, page } = await openBrowser();

  await page.goto(RAMASSAGE_URL, {
    waitUntil: "domcontentloaded",
  });

  if (!page.url().includes("login.php")) {
    console.log("✅ SHExpress already logged in");
    return { browser, page };
  }

  console.log("🔐 SHExpress session expired. Logging in...");

  const email = process.env.SHEXPRESS_EMAIL;
  const password = process.env.SHEXPRESS_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing SHEXPRESS_EMAIL or SHEXPRESS_PASSWORD in .env");
  }

  await page.goto(LOGIN_URL, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForSelector('input[name="username"]');
  await page.fill('input[name="username"]', email);
  await page.fill('input[name="password"]', password);

  const loginButton = page.locator(".lx-submit a").first();

  console.log("Login buttons found:", await loginButton.count());

  await loginButton.waitFor({ state: "visible", timeout: 10000 });

  await Promise.all([
    page
      .waitForURL((url) => !url.toString().includes("login.php"), {
        timeout: 15000,
      })
      .catch(() => null),

    loginButton.evaluate((el) => el.click()),
  ]);

  await page.goto(RAMASSAGE_URL, {
    waitUntil: "domcontentloaded",
  });

  if (page.url().includes("login.php")) {
    throw new Error(
      "SHExpress login failed. Check email/password or login button selector.",
    );
  }

  console.log("✅ SHExpress logged in");

  return { browser, page };
}
