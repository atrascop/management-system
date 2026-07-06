export function normalizeProduct(product) {
  return {
    shopify_product_id: String(product.id),
    title: product.title,
    price: Number(product.variants?.[0]?.price ?? 0),
    product_type: product.product_type || null,

    // IMPORTANT:
    // cost and inventory_quantity are client/manual fields.
    // Do not sync them from Shopify.
  };
}
