import supabase from "../../supabase.js";
import { getAdsCostPerProduct } from "../ads/ads.cost.js";

/**
 * PROFIT PER ORDER ENGINE
 */
export async function calculateProfitPerOrder() {
  const { data: orders, error } = await supabase.from("orders").select("*");

  if (error) throw error;

  const adsCostMap = await getAdsCostPerProduct();

  const results = [];

  for (const order of orders) {
    const product = order.product_name || "unknown";

    const revenue = Number(order.total_price || 0);

    const adsCost = adsCostMap[product] || 0;

    const profit = revenue - adsCost;

    results.push({
      order_id: order.id,
      product_name: product,
      revenue,
      ads_cost: adsCost,
      profit,
    });
  }

  return results;
}
