import supabase from "../../../supabase.js";
import { adjustProductStockForOrder } from "../../products.service.js";
import { ensureShexpressLogin } from "./login.js";

const RETURNS_URL = "https://shexpress.ma/is-admin/bls.php?type=BRC";

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseColis(value = "") {
  return String(value)
    .split(",")
    .map((code) => code.trim())
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

    if (error) {
      throw error;
    }

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
        quantity: Number(order.quantity || 1),
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
        reason: "Already synchronized or product not found",
      });
    }
  }

  return {
    returnedSynced,
    returnedSkipped,
    stockResults,
  };
}

async function waitForReturnsTable(page) {
  await page.locator(".lx-table-bls table tbody").waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function readReturnData(button) {
  const row = button.locator("xpath=ancestor::tr[1]");

  const cells = (await row.locator("td").allInnerTexts()).map(cleanText);

  const slipCode =
    cells.find((value) => /^BRC-/i.test(value)) ||
    cleanText(await button.getAttribute("data-code"));

  const validationCodeCell = button.locator(
    "xpath=ancestor::td[1]/preceding-sibling::td[1]",
  );

  const validationCode =
    (await validationCodeCell.count()) > 0
      ? cleanText(await validationCodeCell.innerText())
      : "";

  return {
    id: cleanText(await button.getAttribute("data-id")),
    slipCode,
    validationCode,
    colis: cleanText(await button.getAttribute("data-colis")),
    cells,
  };
}

async function findConfirmationButton(page) {
  const selectors = [
    ".lx-popup:visible a.lx-validate-bl-0",
    ".lx-popup:visible button.lx-validate-bl-0",
    '.lx-popup:visible a:has-text("Oui")',
    '.lx-popup:visible button:has-text("Oui")',
    '.lx-popup:visible a:has-text("Confirmer")',
    '.lx-popup:visible button:has-text("Confirmer")',
    '.lx-popup:visible a:has-text("Valider")',
    '.lx-popup:visible button:has-text("Valider")',
  ];

  for (const selector of selectors) {
    const buttons = page.locator(selector);
    const count = await buttons.count();

    for (let index = count - 1; index >= 0; index--) {
      const button = buttons.nth(index);

      if (await button.isVisible().catch(() => false)) {
        return button;
      }
    }
  }

  return null;
}

async function confirmReturnValidation(page) {
  const popup = page.locator(".lx-popup:visible").last();

  await popup.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const confirmButton = await findConfirmationButton(page);

  if (!confirmButton) {
    const popupText = cleanText(await popup.innerText().catch(() => ""));

    throw new Error(`Confirmation button was not found. Popup: ${popupText}`);
  }

  await confirmButton.scrollIntoViewIfNeeded();

  /*
   * SHExpress sometimes attaches the action through
   * JavaScript handlers. evaluate(click) is more reliable
   * than a normal Playwright click for this popup.
   */
  await confirmButton.evaluate((element) => {
    element.click();
  });
}

async function verifyReturnWasValidated(page, slipCode) {
  const row = page
    .locator(".lx-table-bls table tbody tr")
    .filter({
      hasText: slipCode,
    })
    .first();

  if ((await row.count()) === 0) {
    // The row may disappear from the current filter after validation.
    return true;
  }

  const cells = (await row.locator("td").allInnerTexts()).map(cleanText);

  const statusCell = normalizeText(cells[5] || "");

  const validationButton = row.locator(
    [
      "a.lx-validate-reception:visible",
      "button.lx-validate-reception:visible",
      'a:has-text("Valider"):visible',
      'button:has-text("Valider"):visible',
    ].join(", "),
  );

  const stillHasValidationButton = (await validationButton.count()) > 0;

  return !stillHasValidationButton && statusCell.includes("valide");
}

export async function validateReturnSlip() {
  const { browser, page } = await ensureShexpressLogin();

  const attemptedSlips = new Set();
  const results = [];
  const failures = [];

  try {
    await page.goto(RETURNS_URL, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    await waitForReturnsTable(page);

    while (true) {
      const buttons = page.locator(
        [
          ".lx-table-bls table tbody a.lx-validate-reception:visible",
          ".lx-table-bls table tbody button.lx-validate-reception:visible",
          '.lx-table-bls table tbody a:has-text("Valider"):visible',
          '.lx-table-bls table tbody button:has-text("Valider"):visible',
        ].join(", "),
      );

      const count = await buttons.count();

      if (count === 0) {
        break;
      }

      let selectedButton = null;
      let selectedData = null;

      for (let index = 0; index < count; index++) {
        const button = buttons.nth(index);
        const data = await readReturnData(button);

        const attemptKey = data.slipCode || data.id || `return-${index}`;

        if (!attemptedSlips.has(attemptKey)) {
          attemptedSlips.add(attemptKey);

          selectedButton = button;
          selectedData = data;

          break;
        }
      }

      /*
       * Every remaining button has already failed during
       * this run. Stop instead of retrying forever.
       */
      if (!selectedButton || !selectedData) {
        console.log("⏭️ No unprocessed return slips remain");

        break;
      }

      const { slipCode, validationCode, colis, cells } = selectedData;

      console.log("↩️ Processing return slip:", {
        slipCode,
        validationCode,
        colis,
      });

      try {
        await selectedButton.scrollIntoViewIfNeeded();

        await selectedButton.click({
          timeout: 10_000,
        });

        await confirmReturnValidation(page);

        await page.waitForTimeout(4_000);

        await page.reload({
          waitUntil: "networkidle",
          timeout: 60_000,
        });

        await waitForReturnsTable(page);

        const validated = await verifyReturnWasValidated(page, slipCode);

        if (!validated) {
          throw new Error(
            "The return still shows the Valider button after confirmation",
          );
        }

        /*
         * Update stock only after SHExpress confirms that
         * the return changed to Validé.
         */
        const stockSync = await applyReturnStock(parseColis(colis));

        results.push({
          slipCode,
          validationCode,
          colis,
          status: "validated",
          ...stockSync,
        });

        console.log("✅ Return slip validated:", {
          slipCode,
          returnedSynced: stockSync.returnedSynced,
          returnedSkipped: stockSync.returnedSkipped,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error("❌ Return validation failed:", {
          slipCode,
          validationCode,
          cells,
          error: message,
        });

        failures.push({
          slipCode,
          validationCode,
          error: message,
        });

        await page.reload({
          waitUntil: "networkidle",
          timeout: 60_000,
        });

        await waitForReturnsTable(page);
      }
    }

    return {
      success: failures.length === 0,
      validated: results.length,
      failed: failures.length,
      results,
      failures,
    };
  } finally {
    await browser.close();
  }
}
