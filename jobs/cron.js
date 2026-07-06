import cron from "node-cron";
import { validateReturnSlip } from "../lib/services/delivery/playwright/validateReturn.js";
import { syncWarehouseStock } from "../lib/services/delivery/playwright/syncWarehouseStock.js";
import { importReturnReceipts } from "../lib/services/delivery/returns.import.service.js";
console.log("🕒 Cron jobs loaded");

async function validateShexpressReturns() {
  try {
    console.log("🔄 Checking SHExpress BRC returns...");

    const result = await validateReturnSlip();

    console.log("✅ BRC returns checked:", result);
  } catch (error) {
    console.error("❌ BRC return validation failed:", error.message);
  }
}

async function syncShexpressWarehouseStock() {
  try {
    console.log("🔄 Syncing SHExpress warehouse stock...");
    const result = await syncWarehouseStock();
    console.log("✅ SHExpress stock synced:", result);
  } catch (error) {
    console.error("❌ SHExpress stock sync failed:", error.message);
  }
}
async function importShexpressReturns() {
  try {
    console.log("🔄 Importing SHExpress return receipts...");

    const result = await importReturnReceipts();

    console.log("✅ Return receipts imported:", {
      imported: result.imported,
    });
  } catch (error) {
    console.error("❌ Return receipts import failed:", error.message);
  }
}
// Run every day at 09:00
cron.schedule("0 9 * * *", validateShexpressReturns);

// Run every day at 21:00
cron.schedule("0 21 * * *", validateShexpressReturns);
cron.schedule("5 9 * * *", importShexpressReturns);
cron.schedule("5 21 * * *", importShexpressReturns);
cron.schedule("10 9 * * *", syncShexpressWarehouseStock);
cron.schedule("10 21 * * *", syncShexpressWarehouseStock);
