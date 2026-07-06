import supabase from "../../supabase.js";

function inRange(row, from, to) {
  const day = row.date;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * Get ads cost grouped per product/campaign mapping
 */
export async function getAdsCostPerProduct(filters = {}) {
  const { from, to } = filters;

  const { data: ads, error } = await supabase
    .from("ads_spend")
    .select(
      "campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, product_name, spend, date",
    );

  if (error) throw error;

  const { data: mappings, error: mapError } = await supabase
    .from("product_campaign_mappings")
    .select("*");

  if (mapError) throw mapError;

  const map = {};

  for (const row of ads || []) {
    if (!inRange(row, from, to)) continue;

    let productName = row.product_name;

    if (!productName) {
      const matched = (mappings || []).find((m) => {
        return (
          String(m.campaign_id || "") === String(row.campaign_id || "") ||
          String(m.campaign_name || "").toLowerCase() ===
            String(row.campaign_name || "").toLowerCase() ||
          String(m.adset_id || "") === String(row.adset_id || "") ||
          String(m.adset_name || "").toLowerCase() ===
            String(row.adset_name || "").toLowerCase() ||
          String(m.ad_id || "") === String(row.ad_id || "") ||
          String(m.ad_name || "").toLowerCase() ===
            String(row.ad_name || "").toLowerCase()
        );
      });

      productName = matched?.product_name;
    }

    if (!productName) productName = "Unmapped Ads";

    map[productName] = (map[productName] || 0) + Number(row.spend || 0);
  }

  return map;
}
