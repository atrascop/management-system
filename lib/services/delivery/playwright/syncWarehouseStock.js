import supabase from "../../../supabase.js";
import { ensureShexpressLogin } from "./login.js";

const STOCK_URL = "https://shexpress.ma/is-admin/stocks.php";

function clean(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(produits?|pcs?|piece|pieces)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const ALIASES = {
  "lumiers d ambiance premium rgb pour voiture":
    "Lumières d'ambiance Premium RGB pour Voiture",

  "protecteur de pare brise fraicheur et protection pour votre voiture":
    "Protecteur de pare-brise - Fraîcheur & Protection Pour Votre Voiture",
};

function resolveAlias(title) {
  const key = clean(title);
  return ALIASES[key] || title;
}
export async function syncWarehouseStock() {
  const { browser, page } = await ensureShexpressLogin();

  try {
    await page.goto(STOCK_URL, {
      waitUntil: "networkidle",
    });

    await page
      .locator("table tbody")
      .waitFor({ state: "visible", timeout: 30000 });

    const shexStock = await page
      .locator("tbody tr:not(.lx-first-tr)")
      .evaluateAll((rows) =>
        rows
          .map((row) => {
            const cells = [...row.querySelectorAll("td")];

            return {
              title: cells[1]?.innerText.trim(),

              stock: Number(cells[5]?.innerText.trim() || 0),
            };
          })
          .filter((x) => x.title),
      );

    const { data: products, error } = await supabase
      .from("products")
      .select("id,title");

    if (error) throw error;

    let updated = 0;
    let skipped = 0;

    for (const item of shexStock) {
      const product = products.find((p) => {
        const a = clean(p.title);
        const b = clean(resolveAlias(item.title));

        return a === b || a.includes(b) || b.includes(a);
      });

      if (!product) {
        console.log("❌ Not matched:", item.title, "stock:", item.stock);
        skipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("products")
        .update({
          shexpress_stock: item.stock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      if (updateError) throw updateError;

      updated++;
    }

    return {
      success: true,
      found: shexStock.length,
      updated,
      skipped,
    };
  } finally {
    await browser.close();
  }
}
