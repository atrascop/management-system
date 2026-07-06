import cron from "node-cron";

import { validateReturnSlip } from "../lib/services/delivery/playwright/validateReturn.js";
import { syncWarehouseStock } from "../lib/services/delivery/playwright/syncWarehouseStock.js";
import { importReturnReceipts } from "../lib/services/delivery/returns.import.service.js";
import { syncMetaAdsForRange } from "../lib/services/ads.service.js";

console.log("🕒 Cron jobs loaded");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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
    console.error("❌ Meta Ads auto sync failed:", error.message);
  } finally {
    metaAdsSyncRunning = false;
  }
}

// SHExpress returns: every day at 09:00 and 21:00
cron.schedule("0 9 * * *", validateShexpressReturns);
cron.schedule("0 21 * * *", validateShexpressReturns);

// SHExpress returns import: every day at 09:05 and 21:05
cron.schedule("5 9 * * *", importShexpressReturns);
cron.schedule("5 21 * * *", importShexpressReturns);

// SHExpress warehouse stock: every day at 09:10 and 21:10
cron.schedule("10 9 * * *", syncShexpressWarehouseStock);
cron.schedule("10 21 * * *", syncShexpressWarehouseStock);

// Meta Ads spend: automatically sync today + yesterday every hour
cron.schedule("0 * * * *", syncMetaAdsAutomatically);

// Run once when backend starts, so dashboard is fresh after deploy/restart
setTimeout(syncMetaAdsAutomatically, 15_000);
