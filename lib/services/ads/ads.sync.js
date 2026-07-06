import { matchAdsToProducts } from "./ads.matcher.js";
import supabase from "../../supabase.js";

export async function syncAdsToProducts() {
  const rows = await matchAdsToProducts();

  const { error } = await supabase.from("ads_spend").upsert(rows);

  if (error) throw error;

  console.log("✅ Ads synced:", rows.length);
  return rows;
}
