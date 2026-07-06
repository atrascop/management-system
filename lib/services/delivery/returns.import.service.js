import supabase from "../../supabase.js";
import { ensureShexpressLogin } from "./playwright/login.js";

const RETURNS_URL = "https://shexpress.ma/is-admin/bls.php?type=BRC";

function parseDate(value) {
  if (!value) return null;

  const [datePart, timePart = "00:00"] = value.trim().split(" ");
  const [day, month, year] = datePart.split("/");

  if (!day || !month || !year) return null;

  return new Date(`${year}-${month}-${day}T${timePart}:00`).toISOString();
}

export async function importReturnReceipts() {
  const { browser, page } = await ensureShexpressLogin();

  try {
    await page.goto(RETURNS_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10000);

    const receipts = await page.locator("tbody tr").evaluateAll((rows) =>
      rows
        .map((row) => {
          const text = row.innerText
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean);

          const brc = text.find((x) => x.startsWith("BRC-"));

          if (!brc) return null;

          const created = text.find((x) => /\d{2}\/\d{2}\/\d{4}/.test(x));

          const validation = text.find((x) => /^\d+$/.test(x));

          const packages = text.find((x) => /^[0-9]+$/.test(x));

          return {
            brc_code: brc,
            packages_count: Number(packages),
            validation_code: validation,
            created_at_shexpress_text: created,
            shexpress_status: text.includes("Validé") ? "Validé" : "Valider",
            raw: text,
          };
        })
        .filter(Boolean),
    );

    const rowsToSave = receipts.map((r) => ({
      brc_code: r.brc_code,
      validation_code: r.validation_code,
      packages_count: r.packages_count,
      shexpress_status: r.shexpress_status,
      created_at_shexpress: parseDate(r.created_at_shexpress_text),
      raw: r.raw,
    }));

    const { data, error } = await supabase
      .from("return_receipts")
      .upsert(rowsToSave, { onConflict: "brc_code" })
      .select();

    if (error) throw error;

    return {
      success: true,
      imported: data.length,
      data,
    };
  } finally {
    await browser.close();
  }
}
