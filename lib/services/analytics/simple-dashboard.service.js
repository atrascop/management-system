import { getAdsSpend } from "../ads.service.js";
import { getProductProfitPerformance } from "./product-profit.service.js";
import {
  getShipmentsStatsByDateRange,
  isDelivered,
} from "../delivery/shexpress.client.js";
import { getDeliveryCost } from "./delivery-pricing.service.js";

const CONFIRMATION_COST_PER_ORDER = 10;

function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function toDay(value) {
  if (!value) return "";

  const text = String(value).trim();

  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function arr(v) {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.data)) return v.data;
  return [];
}

async function getDashboardAdsSpend(filters = {}) {
  const result = await getAdsSpend(filters);
  const rows = arr(result);

  const total = rows.reduce((s, ad) => s + n(ad.spend), 0);

  console.log("✅ DASHBOARD ADS FROM ADS SERVICE", {
    filters,
    rows: rows.length,
    spend: total,
  });

  return rows;
}

export async function getDashboardPerformance(filters = {}) {
  const safeFilters = {
    from: toDay(filters.from) || undefined,
    to: toDay(filters.to || filters.from) || undefined,
  };

  const from = safeFilters.from;
  const to = safeFilters.to || safeFilters.from;

  const [deliveryStats, products, ads] = await Promise.all([
    getShipmentsStatsByDateRange(from, to),
    getProductProfitPerformance(safeFilters),
    getDashboardAdsSpend(safeFilters),
  ]);

  for (const p of products) {
    p.confirmationCost = n(p.deliveredOrders) * CONFIRMATION_COST_PER_ORDER;

    p.profit =
      n(p.revenue) -
      n(p.productCost) -
      n(p.deliveryCost) -
      n(p.adsSpend) -
      n(p.confirmationCost);

    p.roas = n(p.adsSpend) > 0 ? n(p.revenue) / n(p.adsSpend) : 0;

    p.adCostPerOrder =
      n(p.deliveredOrders) > 0 ? n(p.adsSpend) / n(p.deliveredOrders) : 0;
  }

  const delivered = n(deliveryStats.delivered);
  const totalColis = n(deliveryStats.total_colis);
  const returned = n(deliveryStats.failed_or_returned);
  const inProgress = n(deliveryStats.in_progress);

  // Totals from SAME working Delivery page logic
  const revenue = n(deliveryStats.delivered_revenue);

  // Product-level costs from matched products only
  const productCost = products.reduce((s, p) => s + n(p.productCost), 0);
  const deliveredRows = Array.isArray(deliveryStats.data)
    ? deliveryStats.data.filter((row) => isDelivered(row.status))
    : [];

  const deliveryCost = deliveredRows.reduce(
    (s, row) => s + n(getDeliveryCost(row.city)),
    0,
  );
  const confirmationCost = delivered * CONFIRMATION_COST_PER_ORDER;

  // Ads from SAME working Ads page logic
  const adsSpend = ads.reduce((s, ad) => s + n(ad.spend), 0);

  const allocatedAdsSpend = products.reduce((s, p) => s + n(p.adsSpend), 0);
  const unallocatedAdsSpend = Math.max(0, adsSpend - allocatedAdsSpend);

  const profit =
    revenue - productCost - deliveryCost - confirmationCost - adsSpend;

  return {
    orders: {
      total: totalColis,
      pending: 0,
      confirmed: 0,
      shipped: inProgress,
      delivered,
      returned,
      cancelled: 0,
    },

    sales: {
      revenue,
      adsSpend,
      allocatedAdsSpend,
      unallocatedAdsSpend,
      productCost,
      deliveryCost,
      confirmationCost,
      profit,
      roas: adsSpend > 0 ? revenue / adsSpend : 0,
      averageOrderValue: delivered > 0 ? revenue / delivered : 0,
    },

    delivery: {
      deliveryRate: totalColis > 0 ? delivered / totalColis : 0,
      returnRate: totalColis > 0 ? returned / totalColis : 0,
    },

    products: {
      winners: products
        .filter((p) => n(p.deliveredOrders) > 0 && n(p.profit) > 0)
        .sort((a, b) => n(b.profit) - n(a.profit))
        .slice(0, 5),

      losers: products
        .filter((p) => n(p.deliveredOrders) > 0 && n(p.profit) < 0)
        .sort((a, b) => n(a.profit) - n(b.profit))
        .slice(0, 5),
    },
  };
}

export async function getSimpleDashboard(filters = {}) {
  return getDashboardPerformance(filters);
}
