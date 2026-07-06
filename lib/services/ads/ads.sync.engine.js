import supabase from "../../supabase.js";
import { matchAdsToProducts } from "./ads.matcher.js";

/**
 * META → SHOPIFY ADS ATTRIBUTION SYNC
 */
export async function syncAdsToShopify() {
  const matchedRows = await matchAdsToProducts();

  if (!matchedRows.length) {
    console.log("⚠️ No ads to sync");
    return [];
  }

  // STEP 1: clear old attribution (simple MVP strategy)
  const { error: deleteError } = await supabase
    .from("ads_product_attribution")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) throw deleteError;

  // STEP 2: insert fresh data
  const { data, error } = await supabase
    .from("ads_product_attribution")
    .insert(matchedRows)
    .select();

  if (error) throw error;

  console.log("✅ Ads synced to products:", data.length);

  return data;
}
