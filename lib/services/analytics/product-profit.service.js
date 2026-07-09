import supabase from "../../supabase.js";
import { getAdsSpend } from "../ads.service.js";
import { getProducts } from "../products.service.js";
import { getDeliveryCost } from "./delivery-pricing.service.js";
import { getProductCampaignMappings } from "./product-campaign-mapping.service.js";
import * as deliveryService from "../delivery/delivery.service.js";
import stringSimilarity from "string-similarity";

const { compareTwoStrings } = stringSimilarity;

function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function arr(v) {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.data)) return v.data;
  return [];
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

function readFirst(obj = {}, keys = []) {
  for (const key of keys) {
    const value = obj?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function rawOrderProductName(order = {}) {
  return readFirst(order, [
    "product_name",
    "product",
    "Product",
    "produit",
    "Produit",
    "item",
    "Item",
    "title",
    "name",
  ]);
}

function rawOrderCity(order = {}) {
  return readFirst(order, ["city", "City", "ville", "Ville"]);
}

function trackingCode(order = {}) {
  return readFirst(order, [
    "code",
    "Code",
    "tracking_number",
    "trackingNumber",
    "id_colis",
    "ID Colis",
  ]);
}

function cleanOrderProductName(value) {
  return normalize(value)
    .replace(/\b[x×*]\s*\d+\s*$/i, "")
    .replace(/^\d+\s*[x×*]\s*/i, "")
    .trim();
}

function extractQuantityFromProductName(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:x|×|\*)\s*(\d+)\s*$/i);

  if (!match) return 1;

  const qty = Number(match[1]);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function productText(product) {
  return normalize(
    [product?.title, product?.name, product?.product_name, product?.category]
      .filter(Boolean)
      .join(" "),
  );
}

function adText(ad) {
  return normalize(
    [ad?.campaign_name, ad?.adset_name, ad?.ad_name, ad?.product_name]
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

  const adParts = [ad?.campaign_name, ad?.adset_name, ad?.ad_name, aText]
    .map(normalize)
    .filter(Boolean);

  let bestSimilarity = 0;

  for (const part of adParts) {
    bestSimilarity = Math.max(bestSimilarity, compareTwoStrings(pText, part));
  }

  score += bestSimilarity * 300;

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

  return bestScore >= 120 ? bestProduct : null;
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
  const rawName = rawOrderProductName(order);
  const orderName = cleanOrderProductName(rawName);

  const orderShopifyId = order.shopify_product_id
    ? String(order.shopify_product_id)
    : "";

  if (!orderName && !orderShopifyId) {
    return null;
  }

  let bestProduct = null;
  let bestScore = 0;

  for (const product of products || []) {
    const title = normalize(productTitle(product));

    const productShopifyId = product.shopify_product_id
      ? String(product.shopify_product_id)
      : "";

    if (
      orderShopifyId &&
      productShopifyId &&
      orderShopifyId === productShopifyId
    ) {
      return product;
    }

    if (!title || !orderName) continue;

    let score = 0;

    if (title === orderName) score += 1000;

    if (title.includes(orderName) || orderName.includes(title)) {
      score += 500;
    }

    for (const group of ALIAS_GROUPS) {
      if (hasAliasGroup(title, group) && hasAliasGroup(orderName, group)) {
        score += 250;
      }
    }

    score += tokenScore(title, orderName);
    score += compareTwoStrings(title, orderName) * 300;

    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  return bestScore >= 180 ? bestProduct : null;
}

function matchMappingProduct(products, mapping) {
  const mappingName = normalize(mapping.product_name);

  const mappingShopifyId = mapping.shopify_product_id
    ? String(mapping.shopify_product_id)
    : "";

  if (!mappingName && !mappingShopifyId) {
    return null;
  }

  return products.find((p) => {
    const title = normalize(productTitle(p));

    const productShopifyId = p.shopify_product_id
      ? String(p.shopify_product_id)
      : "";

    if (
      mappingShopifyId &&
      productShopifyId &&
      productShopifyId === mappingShopifyId
    ) {
      return true;
    }

    if (!mappingName || !title) return false;

    return (
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
  const codes = (deliveredOrders || [])
    .map((o) => trackingCode(o))
    .filter(Boolean);

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

  const ads = arr(await getAdsSpend(filters));
  const products = arr(await getProducts());
  const mappings = arr(await getProductCampaignMappings());

  const grouped = new Map();
  const allocatedAdKeys = new Set();

  for (const shexOrder of deliveredOrders || []) {
    const code = trackingCode(shexOrder);
    const dbOrder = dbOrdersByTracking.get(code);

    const shexProductName = rawOrderProductName(shexOrder);
    const cleanShexProductName = cleanOrderProductName(shexProductName);

    // Important:
    // SHExpress product column is the source of truth for delivered products.
    // DB is only fallback when SHExpress product name is missing.
    const orderProductName = shexProductName || dbOrder?.product_name || "";

    const extractedQty = extractQuantityFromProductName(shexProductName);

    const quantity =
      extractedQty > 1
        ? extractedQty
        : n(shexOrder.quantity) || n(dbOrder?.quantity) || extractedQty || 1;

    const order = {
      ...shexOrder,

      code,
      city: rawOrderCity(shexOrder),

      product_name: orderProductName,

      // Avoid DB shopify_product_id forcing a wrong match when SHExpress already has a product name.
      shopify_product_id:
        shexOrder.shopify_product_id ||
        (!cleanShexProductName ? dbOrder?.shopify_product_id : null),

      quantity,

      // SHExpress price is the delivered order total.
      price:
        n(shexOrder.price) ||
        n(shexOrder.prix) ||
        n(shexOrder.Prix) ||
        n(dbOrder?.total_price) ||
        n(dbOrder?.product_price),
    };

    const product = matchProduct(products, order);

    console.log("📦 DASHBOARD DELIVERY MATCH:", {
      code,
      rawProduct: shexProductName,
      cleanProduct: cleanShexProductName,
      matchedProduct: productTitle(product) || "UNMATCHED",
      quantity,
      price: order.price,
    });

    if (!product && !cleanOrderProductName(orderProductName)) {
      console.warn(
        "⚠️ SKIPPED DELIVERY ORDER WITHOUT PRODUCT NAME:",
        shexOrder,
      );
      continue;
    }

    const key = product
      ? rowKey(product, productTitle(product))
      : `shex:${cleanOrderProductName(orderProductName)}`;

    if (!grouped.has(key)) {
      grouped.set(
        key,
        createRow(
          product,
          {
            ...order,
            product_name:
              productTitle(product) ||
              cleanOrderProductName(orderProductName) ||
              orderProductName,
          },
          {
            matchedBy: product
              ? "delivery_product_match"
              : "shex_name_unmatched",
          },
        ),
      );
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

  // 1) Manual mappings first.
  // Important: only allocate ads to products that already have delivered orders.
  for (const mapping of mappings || []) {
    const product = matchMappingProduct(products, mapping);
    if (!product) continue;

    const key = rowKey(product, productTitle(product));
    if (!grouped.has(key)) continue;

    const row = grouped.get(key);

    for (const ad of ads || []) {
      if (!adMatchesMapping(ad, mapping)) continue;

      const keyAd = adKey(ad);
      if (allocatedAdKeys.has(keyAd)) continue;

      const spend = n(ad.spend);
      if (spend <= 0) continue;

      row.adsSpend += spend;
      row.totalCampaignSpend += spend;
      row.matchedBy = row.matchedBy || "manual_mapping";

      allocatedAdKeys.add(keyAd);
    }
  }

  // 2) Auto-match remaining ads only against delivered products.
  const deliveredProducts = products.filter((product) => {
    const key = rowKey(product, productTitle(product));
    return grouped.has(key);
  });

  for (const ad of ads || []) {
    const keyAd = adKey(ad);
    if (allocatedAdKeys.has(keyAd)) continue;

    const spend = n(ad.spend);
    if (spend <= 0) continue;

    const product = findProductForAd(deliveredProducts, ad);

    if (!product) {
      console.warn(
        "⚠️ UNALLOCATED ADS:",
        ad.campaign_name || ad.ad_name || ad.adset_name || "Unmapped ad",
        "spend:",
        spend,
      );
      continue;
    }

    const key = rowKey(product, productTitle(product));
    if (!grouped.has(key)) continue;

    const row = grouped.get(key);

    row.adsSpend += spend;
    row.totalCampaignSpend += spend;
    row.matchedBy = row.matchedBy || "auto_string_similarity";

    allocatedAdKeys.add(keyAd);

    console.log(
      "✅ AUTO ADS MATCH:",
      ad.campaign_name || ad.ad_name || ad.adset_name,
      "=>",
      row.product,
      "spend:",
      spend,
    );
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
    .filter((row) => n(row.deliveredOrders) > 0)
    .sort((a, b) => n(b.profit) - n(a.profit));
}

export async function getWinningProducts(filters = {}) {
  const rows = await getProductProfitPerformance(filters);

  return rows
    .filter((r) => n(r.deliveredOrders) > 0 && n(r.profit) > 0)
    .slice(0, 5);
}

export async function getLosingProducts(filters = {}) {
  const rows = await getProductProfitPerformance(filters);

  return rows
    .filter(
      (r) =>
        n(r.deliveredOrders) > 0 &&
        (n(r.profit) < 0 || (n(r.adsSpend) > 0 && n(r.roas) < 1.5)),
    )
    .sort((a, b) => n(a.profit) - n(b.profit))
    .slice(0, 5);
}
