import supabase from "../../supabase.js";
import * as shExpress from "./shexpress.client.js";
import * as repo from "./shipment.service.js";

export async function createShipment(order) {
  const payload = {
    order_id: order.id || order.order_id,
    name: order.customer_name || order.name,
    phone: order.phone,
    city: order.city,
    address: order.address,
    product: order.product_name || order.product,
    price: order.total_price || order.price,
    quantity: order.quantity || 1,
    note: order.note || "",
  };

  const result = await shExpress.createShipment(payload);

  const shipment = await repo.saveShipment({
    order_id: payload.order_id,
    provider: "shexpress",
    tracking_number: result.trackingNumber,
    status: result.status || "created",
    payload,
  });

  return shipment;
}

export async function trackShipment(trackingNumber) {
  const external = await shExpress.trackShipment(trackingNumber);

  return {
    tracking_number: trackingNumber,
    status: external?.status || "unknown",
    history: external?.history || external,
  };
}

export async function syncShipmentStatus(trackingNumber) {
  const external = await shExpress.trackShipment(trackingNumber);

  if (!external) return null;

  const status = external.status || "unknown";

  if (status === "Livré" || status === "delivered") {
    await supabase
      .from("orders")
      .update({ status: "delivered" })
      .eq("tracking_number", trackingNumber);
  }

  if (status === "Refusé" || status === "returned") {
    await supabase
      .from("orders")
      .update({ status: "returned" })
      .eq("tracking_number", trackingNumber);
  }

  return {
    tracking_number: trackingNumber,
    status,
  };
}

export async function getDeliveredOrders({ from, to }) {
  console.log("🔥 getDeliveredOrders CALLED:", { from, to });

  try {
    const rows = await shExpress.listDeliveredShipmentsByDateRange(from, to);

    console.log("✅ getDeliveredOrders SHExpress result:", {
      from,
      to,
      count: rows?.length || 0,
      revenue: (rows || []).reduce(
        (sum, row) => sum + Number(row.price || 0),
        0,
      ),
      rows: (rows || []).map((row) => ({
        code: row.code,
        status: row.status,
        price: row.price,
        product_name: row.product_name,
        city: row.city,
        date_add: row.date_add,
        date_update: row.date_update,
        date_add_day: row.date_add_day,
        date_update_day: row.date_update_day,
      })),
    });

    return rows || [];
  } catch (err) {
    console.warn("⚠️ SHExpress unavailable, using orders DB:", err.message);

    let query = supabase
      .from("orders")
      .select(
        "tracking_number, product_name, product_price, shopify_product_id, quantity, total_price, city, status, delivered_at",
      )
      .eq("status", "delivered");

    if (from) query = query.gte("delivered_at", `${from}T00:00:00`);
    if (to) query = query.lte("delivered_at", `${to}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;

    console.log("❌ DB FALLBACK USED:", {
      from,
      to,
      count: data?.length || 0,
      revenue: (data || []).reduce(
        (sum, row) => sum + Number(row.total_price || row.product_price || 0),
        0,
      ),
    });

    return (data || []).map((o) => ({
      code: o.tracking_number,
      product_name: o.product_name,
      shopify_product_id: o.shopify_product_id,
      quantity: Number(o.quantity || 1),
      price: Number(o.total_price || o.product_price || 0),
      city: o.city,
      status: "Livré",
      raw: o,
    }));
  }
}
