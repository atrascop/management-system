import { getOrders, updateOrder } from "./orders.service.js";

function normalizePhone(phone) {
  if (!phone) return null;

  return String(phone)
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace("+212", "0")
    .replace(/^212/, "0");
}

function normalizeStatus(status) {
  if (!status) return "pending";

  const s = String(status).toLowerCase();

  if (s.includes("livré") || s.includes("delivered")) {
    return "delivered";
  }

  if (
    s.includes("refusé") ||
    s.includes("annulé") ||
    s.includes("retour") ||
    s.includes("returned")
  ) {
    return "returned";
  }

  if (
    s.includes("ajouté") ||
    s.includes("ramassé") ||
    s.includes("expédié") ||
    s.includes("distribution") ||
    s.includes("shipped") ||
    s.includes("pickup")
  ) {
    return "shipped";
  }

  return "pending";
}

async function fetchSHExpressColis() {
  const url =
    `https://shexpress.ma/colislist.php?` +
    `tk=${process.env.SHEXPRESS_TOKEN}` +
    `&sk=${process.env.SHEXPRESS_SECRET_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`SHExpress API error: ${response.status}`);
  }

  return await response.json();
}

function findMatchingOrder(colis, orders) {
  const colisPhone = normalizePhone(colis.Phone);
  const colisPrice = Number(colis.Price);

  return orders.find((order) => {
    const orderPhone = normalizePhone(
      order.phone ||
        order.customer_phone ||
        order.shipping_phone ||
        order.billing_phone,
    );

    const orderPrice = Number(order.total_price);

    return (
      colisPhone &&
      orderPhone &&
      colisPhone === orderPhone &&
      Math.abs(orderPrice - colisPrice) <= 2
    );
  });
}

export async function backfillDelivery({ from, to }) {
  const ordersResult = await getOrders({
    from,
    to,
    limit: 10000,
    page: 1,
  });

  const orders = Array.isArray(ordersResult)
    ? ordersResult
    : ordersResult.data || [];

  const colisList = await fetchSHExpressColis(from, to);

  let matched = 0;
  let updated = 0;
  let unmatched = 0;

  for (const colis of colisList) {
    const order = findMatchingOrder(colis, orders);

    if (!order) {
      unmatched++;
      continue;
    }

    matched++;

    const trackingNumber = colis.Code || null;
    const rawStatus = colis.State || null;
    const status = normalizeStatus(rawStatus);

    await updateOrder(order.id, {
      status,
      tracking_number: trackingNumber,
      delivery_status: rawStatus,
      delivery_provider: "SHExpress",
      delivery_synced_at: new Date().toISOString(),
    });

    updated++;
  }

  return {
    from,
    to,
    orders_found: orders.length,
    colis_found: colisList.length,
    matched,
    updated,
    unmatched,
  };
}
