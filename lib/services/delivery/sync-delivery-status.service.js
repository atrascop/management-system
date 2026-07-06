import supabase from "../../supabase.js";
import { getDeliveryCost } from "../analytics/delivery-pricing.service.js";
import { mapShexpressStatus } from "./shexpress-status-mapper.js";

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneVariants(value) {
  const phone = cleanPhone(value);
  const last9 = phone.slice(-9);
  const local10 = last9 ? `0${last9}` : "";

  return [...new Set([phone, last9, local10].filter(Boolean))];
}

function normalizePrice(value) {
  return Math.round(Number(value || 0));
}

function findBestOrderMatch(candidates, price) {
  const normalizedPrice = normalizePrice(price);

  return (candidates || []).find((candidate) => {
    const orderPrice = normalizePrice(candidate.total_price);
    return Math.abs(orderPrice - normalizedPrice) <= 3;
  });
}

export async function syncDeliveryStatuses(deliveryRows = []) {
  let updated = 0;
  let skipped = 0;

  for (const row of deliveryRows) {
    const phone = row.phone || row.telephone || "";
    const price = normalizePrice(row.price || row.total_price);
    const city = row.city || row.ville || "";
    const tracking = row.tracking_number || row.code || row.id_colis || "";
    const shexpressStatus = row.status || row.etat || "";

    if (!phone || !price) {
      skipped++;
      continue;
    }

    const variants = phoneVariants(phone);

    const orQuery = variants
      .map((variant) => `phone.ilike.%${variant}%`)
      .join(",");

    const { data: candidates, error: searchError } = await supabase
      .from("orders")
      .select("*")
      .or(orQuery)
      .order("created_at", { ascending: false })
      .limit(20);

    if (searchError) {
      console.error("Delivery sync search error:", searchError);
      skipped++;
      continue;
    }

    const order = findBestOrderMatch(candidates, price);

    if (!order) {
      skipped++;
      continue;
    }

    const newStatus = mapShexpressStatus(shexpressStatus);
    const deliveryCost = getDeliveryCost(city || order.city || order.address1);

    // Use SHExpress update timestamp instead of "now"
    const deliveryDate =
      row.date_update || row.date_add
        ? new Date(Number(row.date_update || row.date_add) * 1000).toISOString()
        : new Date().toISOString();

    const { error } = await supabase
      .from("orders")
      .update({
        status: newStatus,
        tracking_number: tracking || order.tracking_number,
        delivery_cost: deliveryCost,
        delivery_status: shexpressStatus,
        delivery_synced_at: new Date().toISOString(),
        delivered_at:
          newStatus === "delivered" ? deliveryDate : order.delivered_at,
      })
      .eq("id", order.id);

    if (error) {
      console.error("Delivery sync update error:", error);
      skipped++;
      continue;
    }

    updated++;
  }

  return {
    updated,
    skipped,
    total: deliveryRows.length,
  };
}
