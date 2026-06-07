import cron from "node-cron";
import axios from "axios";
import { supabase } from "../lib/supabase.js";
import { ensureSession, syncAllStatuses } from "../services/polivraison.js";

// Keep Polivraison session alive
cron.schedule("*/30 * * * *", async () => {
  console.log("🔄 Keeping Polivraison session alive...");
  await ensureSession();
});

// Sync Polivraison statuses every hour
cron.schedule("0 * * * *", async () => {
  console.log("📦 Syncing Polivraison statuses...");

  try {
    const updates = await syncAllStatuses();

    for (const update of updates) {
      await supabase
        .from("orders")
        .update({
          deliveryStatus: update.deliveryStatus,
          updated_at: update.updatedAt,
        })
        .eq("waybillNumber", update.waybillNumber);
    }

    console.log(`✅ Synced ${updates.length} shipments`);
  } catch (error) {
    console.error("❌ Polivraison sync failed:", error.message);
  }
});

// Facebook Ads - daily at 6am and 6pm
cron.schedule("0 6,18 * * *", async () => {
  console.log("📊 Fetching Facebook Ads data...");

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    const url = `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_AD_ACCOUNT_ID}/insights`;

    const response = await axios.get(url, {
      params: {
        access_token: process.env.FACEBOOK_ACCESS_TOKEN,
        fields: "spend",
        time_range: JSON.stringify({ since: dateStr, until: dateStr }),
        level: "account",
      },
    });

    const spend = parseFloat(response.data.data?.[0]?.spend || 0);

    if (spend > 0) {
      await supabase.from("ads_spend").upsert({
        date: dateStr,
        spend: spend,
        platform: "facebook",
      });

      console.log("✅ Ads spend saved:", spend);
    }
  } catch (error) {
    console.error("❌ Facebook API error:", error.message);
  }
});
