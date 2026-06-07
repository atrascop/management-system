import * as provider from "./providers/shexpress.provider.js";
import { saveShipment } from "./shipment.service.js";

let callCount = 0; // 👈 ADD HERE (top of file)

export async function createShipment(order) {
  callCount++; // 👈 FIRST LINE INSIDE FUNCTION

  console.log("🔥 createShipment CALL #", callCount, "for", order.id);

  console.log("🚚 Creating shipment for order:", order.id);

  const result = await provider.createShipment(order);

  console.log("📦 Provider result:", result);

  const shipment = await saveShipment({
    order_id: order.id,
    tracking_number: result.trackingNumber,
    provider: result.provider || "mock",
    status: result.status,
    payload: result,
  });

  console.log("💾 Shipment saved to DB:", shipment);

  return shipment;
}
