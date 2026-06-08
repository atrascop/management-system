console.log(
  "🔥 ORDER RAW LINE ITEMS:",
  JSON.stringify(order.line_items, null, 2),
);
export function normalizeOrder(order) {
  const firstItem = order.line_items?.[0] ?? {};
  const shipping = order.shipping_address ?? {};
  const billing = order.billing_address ?? {};
  const customer = order.customer ?? {};

  const customerName =
    shipping.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    null;

  const fullAddress =
    [shipping.address1, shipping.address2, shipping.city, shipping.country]
      .filter(Boolean)
      .join(", ") || null;

  return {
    // 🧾 Order
    shopify_order_id: String(order.id),

    // 👤 Customer
    email: order.email || null,
    customer_name: customerName,
    phone: shipping.phone || billing.phone || order.phone || null,

    // 💰 Financials
    total_price: Number(order.total_price ?? 0),
    currency: (order.currency ?? "MAD").toUpperCase(),
    financial_status: order.financial_status ?? "pending",
    fulfillment_status: order.fulfillment_status ?? "unfulfilled",

    // 📍 Address
    address1: shipping.address1 || null,
    address2: shipping.address2 || null,
    city: shipping.city || null,
    country: shipping.country || null,
    full_address: fullAddress,

    // 🛒 Product
    product_name: firstItem.title || firstItem.name || null,
    product_price: Number(
      firstItem.price ?? firstItem.price_set?.shop_money?.amount ?? 0,
    ),
    quantity: Number(firstItem.quantity ?? 1),

    // 🔥 Ads / relation key (important for your system)
    shopify_product_id: firstItem.product_id
      ? String(firstItem.product_id)
      : null,
  };
}
