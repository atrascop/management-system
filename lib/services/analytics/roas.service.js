import { getOrders } from "../orders.service.js";
import { getAdsSpend } from "../ads.service.js";
import { matchAdsToProducts } from "../ads/ads.matcher.js";

/**
 * ROAS PER PRODUCT ENGINE
 */
export async function calculateROASPerProduct() {
  const orders = await getOrders();
  const ads = await getAdsSpend();

  // Step 1: get matched ads → products
  const matchedAds = await matchAdsToProducts();

  const result = [];

  for (const ad of matchedAds) {
    if (!ad.product_id) continue;

    const productOrders = orders.filter((o) => o.id === ad.product_id);

    const revenue = productOrders.reduce(
      (sum, o) => sum + Number(o.total_price || 0),
      0,
    );

    const spend = Number(ad.spend || 0);

    const profit = revenue - spend;

    const roas = spend > 0 ? revenue / spend : 0;

    result.push({
      product_id: ad.product_id,
      product_name: ad.product_name,
      campaign_id: ad.campaign_id,
      campaign_name: ad.campaign_name,

      revenue,
      ad_spend: spend,
      profit,
      roas: Number(roas.toFixed(2)),
    });
  }

  console.log("📊 ROAS CALCULATED:", result.length);

  return result;
}
