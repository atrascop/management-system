import { getOrders } from "../orders.service.js";
import { matchAdsToProducts } from "../ads/ads.matcher.js";

const SUCCESSFUL_REVENUE_STATUSES = new Set([
  "confirmed",
  "delivered",
  "shipped",
]);

function orderBelongsToProduct(order, productId, productName) {
  return (
    String(order.product_id || "") === String(productId) ||
    String(order.shopify_product_id || "") === String(productId) ||
    String(order.product_name || "").toLowerCase().trim() ===
      String(productName || "").toLowerCase().trim()
  );
}

function orderRevenue(order) {
  return Number(order.total_price ?? order.total ?? 0);
}

function orderQuantity(order) {
  return Number(order.quantity || 1);
}

export async function calculateROASPerProduct(filters = {}) {
  const ordersResult = await getOrders(filters);
  const orders = Array.isArray(ordersResult) ? ordersResult : ordersResult.data;
  const matchedAds = await matchAdsToProducts(filters);
  const result = [];

  for (const ad of matchedAds) {
    if (!ad.product_id) {
      result.push({
        ...ad,
        revenue: 0,
        product_cost_total: null,
        ad_spend: ad.spend,
        profit: null,
        roas: 0,
        risk: "No product match",
      });
      continue;
    }

    const productOrders = orders.filter(
      (order) =>
        SUCCESSFUL_REVENUE_STATUSES.has(order.status) &&
        orderBelongsToProduct(order, ad.product_id, ad.product_name),
    );

    const revenue = productOrders.reduce(
      (sum, order) => sum + orderRevenue(order),
      0,
    );
    const spend = Number(ad.spend || 0);
    const missingCost = ad.missing_cost || ad.product_cost === null;
    const productCostTotal = missingCost
      ? null
      : productOrders.reduce(
          (sum, order) => sum + Number(ad.product_cost || 0) * orderQuantity(order),
          0,
        );
    const profit = missingCost ? null : revenue - Number(productCostTotal || 0) - spend;
    const roas = spend > 0 ? revenue / spend : 0;

    result.push({
      product_id: ad.product_id,
      product_name: ad.product_name,
      campaign_id: ad.campaign_id,
      campaign_name: ad.campaign_name,
      revenue,
      ad_spend: spend,
      product_cost: ad.product_cost,
      product_cost_total: productCostTotal,
      missing_cost: missingCost,
      profit,
      roas: Number(roas.toFixed(2)),
      order_count: productOrders.length,
      risk: missingCost ? "Missing cost" : null,
    });
  }

  return result;
}
