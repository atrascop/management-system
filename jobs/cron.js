import cron from "node-cron";

import { validateReturnSlip } from "../lib/services/delivery/playwright/validateReturn.js";
import { syncWarehouseStock } from "../lib/services/delivery/playwright/syncWarehouseStock.js";
import { importReturnReceipts } from "../lib/services/delivery/returns.import.service.js";
import { syncMetaAdsForRange } from "../lib/services/ads.service.js";

// Enable this import after the invoice table and Storage bucket work.
// import { syncClientInvoices } from "../lib/services/invoices/playwright/syncClientInvoices.js";

console.log("🕒 Cron jobs loaded");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runStep(name, task) {
  try {
    console.log(`🔄 ${name}...`);

    const result = await task();

    console.log(`✅ ${name} completed:`, result);

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error(`❌ ${name} failed:`, errorMessage(error));

    return {
      success: false,
      error: errorMessage(error),
    };
  }
}

/*
|--------------------------------------------------------------------------
| SHExpress automation
|--------------------------------------------------------------------------
*/

let shexpressAutomationRunning = false;

async function runShexpressAutomation() {
  if (shexpressAutomationRunning) {
    console.log(
      "⏭️ SHExpress automation skipped: previous run is still active",
    );

    return;
  }

  shexpressAutomationRunning = true;

  const startedAt = Date.now();

  const results = {
    returnValidation: null,
    returnImport: null,
    warehouseStock: null,
    invoices: null,
  };

  console.log("========================================");
  console.log("🚚 SHExpress automation started");
  console.log("========================================");

  try {
    /*
     * 1. Find every visible "Valider" return slip.
     * 2. Confirm it in SHExpress.
     * 3. Increase returned product stock only after validation.
     */
    results.returnValidation = await runStep(
      "Validating SHExpress return slips",
      validateReturnSlip,
    );

    /*
     * Import validated return receipts into your system
     * so the Returns page is updated.
     */
    results.returnImport = await runStep(
      "Importing SHExpress return receipts",
      importReturnReceipts,
    );

    /*
     * Read the current SHExpress warehouse stock.
     */
    results.warehouseStock = await runStep(
      "Synchronizing SHExpress warehouse stock",
      syncWarehouseStock,
    );

    /*
     * Enable this section only after client_invoices
     * and the client-invoices Storage bucket are ready.
     */
    /*
    results.invoices = await runStep(
      "Synchronizing SHExpress client invoices",
      syncClientInvoices,
    );
    */

    console.log("========================================");
    console.log("✅ SHExpress automation completed");
    console.log(`⏱️ Duration: ${Date.now() - startedAt} ms`);
    console.dir(results, {
      depth: 4,
    });
    console.log("========================================");

    return results;
  } finally {
    shexpressAutomationRunning = false;
  }
}

/*
|--------------------------------------------------------------------------
| Meta Ads automation
|--------------------------------------------------------------------------
*/

let metaAdsSyncRunning = false;

async function syncMetaAdsAutomatically() {
  if (metaAdsSyncRunning) {
    console.log("⏭️ Meta Ads auto sync skipped: already running");

    return;
  }

  metaAdsSyncRunning = true;

  try {
    const today = todayIso();
    const yesterday = addDays(today, -1);

    console.log("🔄 Auto syncing Meta Ads...", {
      from: yesterday,
      to: today,
    });

    const result = await syncMetaAdsForRange({
      from: yesterday,
      to: today,
    });

    console.log("✅ Meta Ads auto synced:", {
      synced: result.synced,
      from: result.from,
      to: result.to,
      totalStoreCurrency: result.totalStoreCurrency,
    });
  } catch (error) {
    console.error("❌ Meta Ads auto sync failed:", errorMessage(error));
  } finally {
    metaAdsSyncRunning = false;
  }
}

/*
|--------------------------------------------------------------------------
| Schedules
|--------------------------------------------------------------------------
*/

// Run SHExpress tasks sequentially every 15 minutes.
cron.schedule("*/15 * * * *", runShexpressAutomation, {
  timezone: "Africa/Casablanca",
});

// Meta Ads every hour.
cron.schedule("0 * * * *", syncMetaAdsAutomatically, {
  timezone: "Africa/Casablanca",
});

/*
|--------------------------------------------------------------------------
| Run once after backend startup
|--------------------------------------------------------------------------
*/

setTimeout(() => {
  runShexpressAutomation().catch((error) => {
    console.error(
      "❌ Initial SHExpress automation failed:",
      errorMessage(error),
    );
  });
}, 30_000);

setTimeout(() => {
  syncMetaAdsAutomatically().catch((error) => {
    console.error(
      "❌ Initial Meta Ads synchronization failed:",
      errorMessage(error),
    );
  });
}, 15_000);

export { runShexpressAutomation, syncMetaAdsAutomatically };
