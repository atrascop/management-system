import supabase from "../../supabase.js";
import { getAdsSpend } from "../ads.service.js";
import { getProductProfitPerformance } from "./product-profit.service.js";
async function fetchAllOrders() {
  let all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    all = all.concat(data || []);

    if (!data || data.length < pageSize) break;

    from += pageSize;
  }

  return all;
}
function inRange(dateValue, from, to) {
  if (!from && !to) return true;

  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  const day = date.toISOString().slice(0, 10);

  if (from && day < from) return false;
  if (to && day > to) return false;

  return true;
}

export async function getDashboardPerformance(filters = {}) {
  console.log("Dashboard filters:", filters);
  const allOrders = await fetchAllOrders();

  const periodOrders = allOrders.filter((order) => {
    const status = String(order.status).toLowerCase();

    if (status === "delivered") {
      return inRange(
        order.delivered_at || order.delivery_synced_at,
        filters.from,
        filters.to,
      );
    }

    return inRange(order.created_at, filters.from, filters.to);
  });

  const products = await getProductProfitPerformance({
    ...filters,
    useDeliveryDate: true,
  });

  const ads = await getAdsSpend(filters);

  const revenue = products.reduce((s, p) => s + Number(p.revenue || 0), 0);
  const productCost = products.reduce(
    (s, p) => s + Number(p.productCost || 0),
    0,
  );
  const deliveryCost = products.reduce(
    (s, p) => s + Number(p.deliveryCost || 0),
    0,
  );

  // REAL Meta spend for selected period
  const adsSpend = ads.reduce((s, ad) => s + Number(ad.spend || 0), 0);

  const profit = revenue - productCost - deliveryCost - adsSpend;

  const delivered = products.reduce(
    (sum, p) => sum + Number(p.deliveredOrders || 0),
    0,
  );

  const returned = periodOrders.filter(
    (o) => String(o.status).toLowerCase() === "returned",
  ).length;

  const base = delivered + returned;

  return {
    orders: {
      total: periodOrders.length,
      pending: periodOrders.filter((o) => o.status === "pending").length,
      confirmed: periodOrders.filter((o) => o.status === "confirmed").length,
      shipped: periodOrders.filter((o) => o.status === "shipped").length,
      delivered,
      returned,
      cancelled: periodOrders.filter((o) => o.status === "cancelled").length,
    },

    sales: {
      revenue,
      adsSpend,
      productCost,
      deliveryCost,
      profit,
      roas: adsSpend > 0 ? revenue / adsSpend : 0,
      averageOrderValue: delivered > 0 ? revenue / delivered : 0,
    },

    delivery: {
      deliveryRate: base > 0 ? delivered / base : 0,
      returnRate: base > 0 ? returned / base : 0,
    },

    products: {
      winners: products.filter((p) => p.profit > 0).slice(0, 5),
      losers: products
        .filter(
          (p) => p.profit < 0 || (p.totalCampaignSpend > 0 && p.roas < 1.5),
        )
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 5),
    },
  };
}
