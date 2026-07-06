import supabase from "../../../supabase.js";
import { adjustProductStockForOrder } from "../../products.service.js";
import { ensureShexpressLogin } from "./login.js";

const RETURNS_URL = "https://shexpress.ma/is-admin/bls.php?type=BRC";

function parseColis(value = "") {
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function applyReturnStock(colisCodes = []) {
  let returnedSynced = 0;
  let returnedSkipped = 0;
  const stockResults = [];

  for (const code of colisCodes) {
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("tracking_number", code)
      .maybeSingle();

    if (error) throw error;

    if (!order) {
      returnedSkipped++;
      stockResults.push({
        code,
        status: "skipped",
        reason: "No matching order",
      });
      continue;
    }

    const adjusted = await adjustProductStockForOrder(
      {
        ...order,
        tracking_number: code,
        quantity: order.quantity || 1,
      },
      "RETURN",
    );

    if (adjusted) {
      returnedSynced++;
      stockResults.push({
        code,
        status: "stock_increased",
        product: order.product_name,
      });
    } else {
      returnedSkipped++;
      stockResults.push({
        code,
        status: "skipped",
        reason: "Already synced or product not found",
      });
    }
  }

  return { returnedSynced, returnedSkipped, stockResults };
}

export async function validateReturnSlip() {
  const { browser, page } = await ensureShexpressLogin();

  try {
    await page.goto(RETURNS_URL, { waitUntil: "networkidle" });

    await page
      .locator(".lx-table-bls table tbody")
      .waitFor({ state: "visible", timeout: 30000 });

    const results = [];

    while (true) {
      const buttons = page.locator("a.lx-validate-reception:visible");
      const count = await buttons.count();

      if (count === 0) break;

      const button = buttons.first();

      const data = await button.evaluate((el) => ({
        id: el.getAttribute("data-id"),
        code: el.getAttribute("data-code"),
        colis: el.getAttribute("data-colis"),
      }));

      const colisCodes = parseColis(data.colis);

      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      await button.click();

      await page.waitForTimeout(1500);

      const yesButton = page.locator(".lx-popup a.lx-validate-bl-0").last();

      if ((await yesButton.count()) > 0) {
        await yesButton.evaluate((el) => el.click());
      }

      await page.waitForTimeout(4000);

      const stockSync = await applyReturnStock(colisCodes);

      results.push({
        code: data.code,
        colis: data.colis,
        status: "validated",
        ...stockSync,
      });

      await page.reload({ waitUntil: "networkidle" });
      await page
        .locator(".lx-table-bls table tbody")
        .waitFor({ state: "visible", timeout: 30000 });
    }

    return {
      success: true,
      validated: results.length,
      results,
    };
  } finally {
    await browser.close();
  }
}
