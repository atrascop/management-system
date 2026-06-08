export function normalizeOrder(order) {
  const firstItem = order.line_items?.[0] || {};
  const shipping = order.shipping_address || {};
  const billing = order.billing_address || {};

  return {
    // 🧾 Order ID
    shopify_order_id: String(order.id),

    // 👤 Customer
    email: order.email || null,
    customer_name:
      shipping.name || (order.customer?.first_name && order.customer?.last_name)
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : null,

    phone: shipping.phone || billing.phone || order.phone || null,

    // 💰 Order financials
    total_price: Number(order.total_price || 0),
    currency: (order.currency || "MAD").toUpperCase(),
    financial_status: order.financial_status || "pending",
    fulfillment_status: order.fulfillment_status || "unfulfilled",

    // 📍 Address
    address1: shipping.address1 || null,
    address2: shipping.address2 || null,
    city: shipping.city || null,
    country: shipping.country || null,

    full_address:
      shipping.address1 || shipping.city
        ? `${shipping.address1 || ""} ${shipping.address2 || ""}, ${
            shipping.city || ""
          }, ${shipping.country || ""}`.trim()
        : null,

    // 🛒 PRODUCT (FIXED)
    product_name: firstItem.title || null,

    product_price: Number(
      firstItem.price || firstItem.price_set?.shop_money?.amount || 0,
    ),

    quantity: Number(firstItem.quantity || 1),

    // 🔥 IMPORTANT (for ads system later)
    shopify_product_id: firstItem.product_id
      ? String(firstItem.product_id)
      : null,
  };
}
