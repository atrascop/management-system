import fetch from "node-fetch";

/**
 * Fetch all Shopify products
 */
export async function fetchShopifyProducts() {
  const url = `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2026-04/products.json?limit=250`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.errors || "Shopify fetch failed");
  }

  return data.products;
}
