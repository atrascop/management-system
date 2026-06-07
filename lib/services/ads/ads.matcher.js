import { getAdsSpend } from "../ads.service.js";
import { getOrders } from "../orders.service.js";

/**
 * ADS → PRODUCT MATCHING ENGINE (MVP)
 * Rule: match campaign_name with product_name keywords
 */
export async function matchAdsToProducts() {
  const ads = await getAdsSpend();
  const orders = await getOrders();

  const results = [];

  for (const ad of ads) {
    const campaignWords = (ad.campaign_name || "").toLowerCase().split(" ");

    let matchedOrder = null;

    for (const order of orders) {
      const productText = (order.product_name || "").toLowerCase();

      // check if ANY keyword matches
      const isMatch = campaignWords.some(
        (word) => word.length > 2 && productText.includes(word),
      );

      if (isMatch) {
        matchedOrder = order;
        break;
      }
    }

    results.push({
      campaign_id: ad.campaign_id || null,
      campaign_name: ad.campaign_name || null,

      product_id: matchedOrder ? matchedOrder.id : null,
      product_name: matchedOrder ? matchedOrder.product_name : null,

      spend: ad.spend || 0,
      date: ad.date,
    });
  }

  console.log("📊 ADS MATCH RESULTS:", results.length);

  return results;
}
