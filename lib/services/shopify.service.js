import supabase from "../supabase.js";
import { normalizeProduct } from "../normalizers/products.js";

/**
 * Fetch products from Shopify Admin API
 */
export async function fetchShopifyProducts() {
  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2026-04/products.json`,
    {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
      },
    },
  );

  const data = await response.json();
  return data.products || [];
}

/**
 * Sync products → Supabase
 */
export async function syncProductsToDB() {
  const products = await fetchShopifyProducts();

  const formatted = products.map(normalizeProduct);

  const { data, error } = await supabase.from("products").upsert(formatted, {
    onConflict: "shopify_product_id",
  });

  if (error) throw error;

  return {
    imported: formatted.length,
    data,
  };
}
