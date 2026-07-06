import { getAdsSpend } from "../ads.service.js";
import { getProductProfitPerformance } from "./product-profit.service.js";

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

async function getDashboardAdsSpend(filters = {}) {
  // IMPORTANT:
  // Dashboard now uses the SAME ads logic as /api/ads
  const result = await getAdsSpend(filters);

  const rows = Array.isArray(result)
    ? result
    : Array.isArray(result?.data)
      ? result.data
      : [];

  const total = rows.reduce((s, ad) => s + n(ad.spend), 0);

  console.log("✅ DASHBOARD ADS FROM ADS SERVICE");
  console.log("filters:", filters);
  console.log("ads rows:", rows.length);
  console.log("ads spend:", total);

  return rows;
}

export async function getDashboardPerformance(filters = {}) {
  const safeFilters = {
    from: toDay(filters.from) || undefined,
    to: toDay(filters.to || filters.from) || undefined,
  };

  const products = await getProductProfitPerformance(safeFilters);

  // Same data as /api/ads
  const ads = await getDashboardAdsSpend(safeFilters);

  for (const p of products) {
    p.confirmationCost = n(p.deliveredOrders) * CONFIRMATION_COST_PER_ORDER;

    // Product card profit uses mapped product ads
    p.profit =
      n(p.revenue) -
      n(p.productCost) -
      n(p.deliveryCost) -
      n(p.adsSpend) -
      n(p.confirmationCost);
  }

  const delivered = products.reduce((s, p) => s + n(p.deliveredOrders), 0);
  const revenue = products.reduce((s, p) => s + n(p.revenue), 0);
  const productCost = products.reduce((s, p) => s + n(p.productCost), 0);
  const deliveryCost = products.reduce((s, p) => s + n(p.deliveryCost), 0);

  const confirmationCost = products.reduce(
    (s, p) => s + n(p.confirmationCost),
    0,
  );

  // Dashboard total ads = ALL ads from /api/ads logic
  const adsSpend = ads.reduce((s, ad) => s + n(ad.spend), 0);

  // Product ads = only ads matched to products
  const allocatedAdsSpend = products.reduce(
    (s, p) => s + (p.isUnmappedAd ? 0 : n(p.adsSpend)),
    0,
  );
  // Ads that exist in Meta but are not matched to any product
  const unallocatedAdsSpend = Math.max(0, adsSpend - allocatedAdsSpend);

  const profit =
    revenue - productCost - deliveryCost - confirmationCost - adsSpend;

  return {
    orders: {
      total: delivered,
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered,
      returned: 0,
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
      deliveryRate: delivered > 0 ? 1 : 0,
      returnRate: 0,
    },

    products: {
      winners: products
        .filter((p) => n(p.profit) > 0)
        .sort((a, b) => n(b.profit) - n(a.profit))
        .slice(0, 5),

      losers: products
        .filter(
          (p) => n(p.profit) < 0 || (n(p.adsSpend) > 0 && n(p.roas) < 1.5),
        )
        .sort((a, b) => n(a.profit) - n(b.profit))
        .slice(0, 5),
    },
  };
}

export async function getSimpleDashboard(filters = {}) {
  return getDashboardPerformance(filters);
}
