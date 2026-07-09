import { getAdsSpend } from "../ads.service.js";
import { getProducts } from "../products.service.js";

const STOP_WORDS = new Set([
  "avec",
  "pour",
  "the",
  "and",
  "campaign",
  "campagne",
  "ads",
  "ad",
]);

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function productName(product) {
  return product.title || product.name || "";
}

function findProductForAd(ad, products) {
  if (ad.product_id) {
    const direct = products.find(
      (product) =>
        String(product.id) === String(ad.product_id) ||
        String(product.shopify_product_id || "") === String(ad.product_id),
    );
    if (direct) return direct;
  }

  if (ad.product_name) {
    const normalizedAdProduct = productName({ title: ad.product_name })
      .toLowerCase()
      .trim();
    const directByName = products.find(
      (product) =>
        productName(product).toLowerCase().trim() === normalizedAdProduct,
    );
    if (directByName) return directByName;
  }

  const campaignWords = tokenize(ad.campaign_name);
  if (!campaignWords.length) return null;

  let bestProduct = null;
  let bestScore = 0;

  for (const product of products) {
    const productWords = new Set(tokenize(productName(product)));
    const score = campaignWords.filter((word) => productWords.has(word)).length;

    if (score > bestScore) {
      bestProduct = product;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestProduct : null;
}

export async function matchAdsToProducts(filters = {}) {
  const ads = await getAdsSpend(filters);
  const products = await getProducts();

  return ads.map((ad) => {
    const product = findProductForAd(ad, products);
    const cost =
      product?.cost === null || product?.cost === undefined
        ? null
        : Number(product.cost);

    return {
      campaign_id: ad.campaign_id || null,
      campaign_name: ad.campaign_name || null,
      product_id: product ? product.id : null,
      product_name: product ? productName(product) : null,
      product_cost: cost,
      missing_cost: Boolean(product && cost === null),
      spend: Number(ad.spend || 0),
      date: ad.date,
    };
  });
}
