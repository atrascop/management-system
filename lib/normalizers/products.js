export function normalizeProduct(product) {
  return {
    shopify_product_id: String(product.id),

    title: product.title,

    status: product.status,

    vendor: product.vendor,

    product_type: product.product_type,

    created_at: product.created_at,
  };
}
