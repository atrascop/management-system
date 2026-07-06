import supabase from "../../supabase.js";
import { getAdsSpend } from "../ads.service.js";
import { getProducts } from "../products.service.js";
import { getDeliveryCost } from "./delivery-pricing.service.js";
import { getProductCampaignMappings } from "./product-campaign-mapping.service.js";
import * as deliveryService from "../delivery/delivery.service.js";

function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function normalize(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productTitle(product) {
  return product?.title || product?.name || product?.product_name || "";
}

function adText(ad) {
  return normalize(
    [ad?.campaign_name, ad?.adset_name, ad?.ad_name, ad?.product_name]
      .filter(Boolean)
      .join(" "),
  );
}

function productText(product) {
  return normalize(
    [product?.title, product?.name, product?.product_name, product?.category]
      .filter(Boolean)
      .join(" "),
  );
}

const ALIAS_GROUPS = [
  [
    "car seat filler",
    "seat filler",
    "anti chute",
    "anti chute siege",
    "organisateur de siege",
    "organisateur siege",
    "2pc organisateur",
    "2pcs organisateur",
    "organisateur lateral",
    "organisateur latéral",
  ],
  [
    "4 siege",
    "4 sieges",
    "4 siège",
    "4 sièges",
    "coussin de siege",
    "coussin siege",
    "coussin siege auto",
  ],
  [
    "orgnizer",
    "organizer",
    "organiseur multifonction",
    "organiseur arriere",
    "organiseur arrière",
    "porte gobelet",
    "mouchoirs",
    "telephone",
    "téléphone",
  ],
  [
    "magnitic",
    "magnetic",
    "cover",
    "pare brise",
    "parebrise",
    "protecteur de pare brise",
    "protecteur pare brise",
  ],
  [
    "mondim",
    "bin cossan",
    "rangement suspendu",
    "rangement entre sieges",
    "rangement entre sièges",
    "rangement voiture",
  ],
  [
    "angel wings",
    "ailes d ange",
    "ailes d'ange",
    "led angel",
    "car wings lights",
    "wings lights",
    "retroviseur",
    "rétroviseur",
    "retroviseur de voiture",
  ],
  [
    "lumiere ambiance",
    "lumières d'ambiance",
    "lumieres ambiance",
    "lumières ambiance",
    "ambiance premium",
    "premium rgb",
    "rgb voiture",
  ],
  [
    "car wash",
    "mousse",
    "la mousse",
    "moussant",
    "pulverisateur",
    "pulvérisateur",
    "pulverisateur moussant",
    "pulvérisateur moussant",
    "lavage voiture",
  ],
  ["creme nettoyage", "crème nettoyage", "nettoyage", "cleaning cream"],
  ["20pcs wheel stickers", "wheel stickers", "stickers roue", "stickers roues"],
  [
    "ensemble elegant",
    "ensemble élégant",
    "cou",
    "dos",
    "proteger le cou",
    "protéger le cou",
    "proteger le dos",
    "protéger le dos",
  ],
];

function hasAliasGroup(text, group) {
  return group.some((alias) => text.includes(normalize(alias)));
}

function tokenScore(a, b) {
  const stopWords = new Set([
    "de",
    "du",
    "la",
    "le",
    "les",
    "des",
    "pour",
    "avec",
    "et",
    "auto",
    "voiture",
    "car",
  ]);

  const aTokens = new Set(
    a.split(" ").filter((t) => t.length > 2 && !stopWords.has(t)),
  );

  const bTokens = new Set(
    b.split(" ").filter((t) => t.length > 2 && !stopWords.has(t)),
  );

  let score = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) score += 10;
  }

  return score;
}

function scoreProductAd(product, ad) {
  const pText = productText(product);
  const aText = adText(ad);

  if (!pText || !aText) return 0;

  let score = 0;

  if (pText === aText) score += 1000;

  if (pText.includes(aText) || aText.includes(pText)) {
    score += 300;
  }

  for (const group of ALIAS_GROUPS) {
    if (hasAliasGroup(pText, group) && hasAliasGroup(aText, group)) {
      score += 250;
    }
  }

  score += tokenScore(pText, aText);

  return score;
}

function findProductForAd(products, ad) {
  let bestProduct = null;
  let bestScore = 0;

  for (const product of products || []) {
    const score = scoreProductAd(product, ad);

    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  return bestScore >= 30 ? bestProduct : null;
}

function adKey(ad) {
  return [
    ad?.id,
    ad?.campaign_id,
    ad?.adset_id,
    ad?.ad_id,
    ad?.date,
    ad?.date_start,
    ad?.campaign_name,
    ad?.spend,
  ]
    .filter(Boolean)
    .join("|");
}

function rowKey(product, fallback = "") {
  if (product?.shopify_product_id) {
    return `shopify:${product.shopify_product_id}`;
  }

  if (product?.id) {
    return `product:${product.id}`;
  }

  return `name:${normalize(fallback)}`;
}

function adMatchesMapping(ad, mapping) {
  return (
    (mapping.campaign_id &&
      String(mapping.campaign_id) === String(ad.campaign_id)) ||
    (mapping.adset_id && String(mapping.adset_id) === String(ad.adset_id)) ||
    (mapping.ad_id && String(mapping.ad_id) === String(ad.ad_id)) ||
    (mapping.campaign_name &&
      normalize(mapping.campaign_name) === normalize(ad.campaign_name)) ||
    (mapping.adset_name &&
      normalize(mapping.adset_name) === normalize(ad.adset_name)) ||
    (mapping.ad_name && normalize(mapping.ad_name) === normalize(ad.ad_name))
  );
}

function matchProduct(products, order) {
  const orderName = normalize(order.product_name);

  return products.find((p) => {
    const title = normalize(productTitle(p));

    return (
      String(p.shopify_product_id || "") ===
        String(order.shopify_product_id || "") ||
      title === orderName ||
      title.includes(orderName) ||
      orderName.includes(title)
    );
  });
}

function matchMappingProduct(products, mapping) {
  const mappingName = normalize(mapping.product_name);

  return products.find((p) => {
    const title = normalize(productTitle(p));

    return (
      String(p.shopify_product_id || "") ===
        String(mapping.shopify_product_id || "") ||
      title === mappingName ||
      title.includes(mappingName) ||
      mappingName.includes(title)
    );
  });
}

function createRow(product, order = {}, extra = {}) {
  return {
    product_id: product?.id || null,
    shopify_product_id:
      product?.shopify_product_id || order?.shopify_product_id || null,

    product:
      productTitle(product) ||
      order?.product_name ||
      extra.product_name ||
      "Unknown product",

    isUnmappedAd: Boolean(extra.isUnmappedAd),
    matchedBy: extra.matchedBy || null,

    deliveredOrders: 0,
    unitsSold: 0,
    revenue: 0,
    productCost: 0,
    deliveryCost: 0,

    adsSpend: 0,
    totalCampaignSpend: 0,
    adCostPerOrder: 0,

    profit: 0,
    roas: 0,
  };
}

async function getDbOrdersByTracking(deliveredOrders) {
  const codes = (deliveredOrders || []).map((o) => o.code).filter(Boolean);

  if (codes.length === 0) return new Map();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "tracking_number, product_name, shopify_product_id, quantity, product_price, total_price",
    )
    .in("tracking_number", codes);

  if (error) throw error;

  return new Map((data || []).map((o) => [o.tracking_number, o]));
}

export async function getProductProfitPerformance(filters = {}) {
  const deliveredOrders = await deliveryService.getDeliveredOrders({
    from: filters.from,
    to: filters.to || filters.from,
  });

  const dbOrdersByTracking = await getDbOrdersByTracking(deliveredOrders);

  const ads = await getAdsSpend(filters);
  const products = await getProducts();
  const mappings = await getProductCampaignMappings();

  const grouped = new Map();
  const allocatedAdKeys = new Set();

  for (const shexOrder of deliveredOrders || []) {
    const dbOrder = dbOrdersByTracking.get(shexOrder.code);

    const order = {
      ...shexOrder,
      product_name: dbOrder?.product_name || shexOrder.product_name,
      shopify_product_id:
        dbOrder?.shopify_product_id || shexOrder.shopify_product_id,
      quantity: dbOrder?.quantity || shexOrder.quantity || 1,
      price: shexOrder.price || dbOrder?.total_price || dbOrder?.product_price,
    };

    const product = matchProduct(products, order);

    const key = rowKey(product, order.product_name || order.code);

    if (!grouped.has(key)) {
      grouped.set(key, createRow(product, order));
    }

    const row = grouped.get(key);

    const qty = n(order.quantity || 1);
    const unitCost = n(product?.cost);

    row.deliveredOrders += 1;
    row.unitsSold += qty;
    row.revenue += n(order.price);
    row.productCost += unitCost * qty;
    row.deliveryCost += n(getDeliveryCost(order.city));
  }

  // 1) First use manual mappings from product_campaign_mappings
  for (const mapping of mappings || []) {
    const product = matchMappingProduct(products, mapping);

    const key = rowKey(product, mapping.product_name);

    if (!key) continue;

    if (!grouped.has(key)) {
      grouped.set(
        key,
        createRow(
          product,
          { product_name: mapping.product_name },
          {
            matchedBy: "manual_mapping",
          },
        ),
      );
    }

    const row = grouped.get(key);

    for (const ad of ads || []) {
      if (!adMatchesMapping(ad, mapping)) continue;

      const keyAd = adKey(ad);
      if (allocatedAdKeys.has(keyAd)) continue;

      const spend = n(ad.spend);

      row.adsSpend += spend;
      row.totalCampaignSpend += spend;

      allocatedAdKeys.add(keyAd);
    }
  }

  // 2) Then auto-match remaining ads by campaign/ad name
  for (const ad of ads || []) {
    const keyAd = adKey(ad);
    if (allocatedAdKeys.has(keyAd)) continue;

    const spend = n(ad.spend);
    if (spend <= 0) continue;

    const product = findProductForAd(products, ad);

    if (product) {
      const key = rowKey(product, productTitle(product));

      if (!grouped.has(key)) {
        grouped.set(
          key,
          createRow(
            product,
            { product_name: productTitle(product) },
            {
              matchedBy: "auto_name_match",
            },
          ),
        );
      }

      const row = grouped.get(key);

      row.adsSpend += spend;
      row.totalCampaignSpend += spend;
      row.matchedBy = row.matchedBy || "auto_name_match";

      console.log(
        "✅ AUTO ADS MATCH:",
        ad.campaign_name || ad.ad_name,
        "=>",
        row.product,
        "spend:",
        spend,
      );
    } else {
      const campaignName =
        ad.campaign_name || ad.ad_name || ad.adset_name || "Unmapped ad";

      const key = `unmapped:${keyAd}`;

      grouped.set(
        key,
        createRow(
          null,
          { product_name: `Unmapped: ${campaignName}` },
          {
            isUnmappedAd: true,
            matchedBy: "unmapped",
          },
        ),
      );

      const row = grouped.get(key);

      row.adsSpend += spend;
      row.totalCampaignSpend += spend;

      console.warn("⚠️ UNMAPPED ADS:", campaignName, "spend:", spend);
    }

    allocatedAdKeys.add(keyAd);
  }

  return Array.from(grouped.values())
    .map((row) => {
      row.profit =
        n(row.revenue) -
        n(row.productCost) -
        n(row.deliveryCost) -
        n(row.adsSpend);

      row.roas = row.adsSpend > 0 ? row.revenue / row.adsSpend : 0;

      row.adCostPerOrder =
        row.deliveredOrders > 0 ? row.adsSpend / row.deliveredOrders : 0;

      return row;
    })
    .filter((row) => row.deliveredOrders > 0 || row.adsSpend > 0)
    .sort((a, b) => n(b.profit) - n(a.profit));
}

export async function getWinningProducts(filters = {}) {
  const rows = await getProductProfitPerformance(filters);
  return rows.filter((r) => n(r.profit) > 0).slice(0, 5);
}

export async function getLosingProducts(filters = {}) {
  const rows = await getProductProfitPerformance(filters);

  return rows
    .filter((r) => n(r.profit) < 0 || (n(r.adsSpend) > 0 && n(r.roas) < 1.5))
    .sort((a, b) => n(a.profit) - n(b.profit))
    .slice(0, 5);
}
