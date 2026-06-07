export function normalizeOrder(order) {
  const firstItem = order.line_items?.[0] || {};
  const shipping = order.shipping_address || {};

  return {
    shopify_order_id: String(order.id),

    // 👤 Customer
    email: order.email || null,
    customer_name: shipping.name || null,
    phone: shipping.phone || order.phone || null,

    // 💰 Order
    total_price: Number(order.total_price || 0),
    currency: order.currency?.toUpperCase() || "MAD",
    financial_status: order.financial_status || "pending",
    fulfillment_status: order.fulfillment_status || "unfulfilled",

    // 📍 Address
    address1: shipping.address1 || null,
    address2: shipping.address2 || null,
    city: shipping.city || null,
    country: shipping.country || null,

    full_address: shipping.address1
      ? `${shipping.address1 || ""} ${shipping.address2 || ""}, ${shipping.city || ""}, ${shipping.country || ""}`
      : null,

    // 🛒 Product
    product_name: firstItem.name || null,
    product_price: Number(firstItem.price || 0),
    quantity: Number(firstItem.quantity || 1),
  };
}
