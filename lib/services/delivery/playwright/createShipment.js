import { ensureShexpressLogin } from "./login.js";

const RAMASSAGE_URL = "https://shexpress.ma/is-admin/ramassage.php?world=0";

export async function createShexpressShipment(order) {
  const { browser, page } = await ensureShexpressLogin();

  await page.goto(RAMASSAGE_URL, {
    waitUntil: "domcontentloaded",
  });

  console.log("Opening new shipment form...");

  await page.locator('a:has-text("Nouveau")').first().click();

  await page.waitForTimeout(10000);

  console.log("Form should be open now.");

  await browser.close();

  return {
    trackingNumber: null,
    status: "form_opened",
    raw: order,
  };
}
