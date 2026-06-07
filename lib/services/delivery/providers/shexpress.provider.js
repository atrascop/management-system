import { request } from "../shexpress.client.js";

/**
 * Create shipment in Shexpress
 */
export async function createShipment(order) {
  console.log("MOCK shipment for:", order.id);

  return {
    success: true,
    trackingNumber: `MOCK-${Date.now()}`,
    status: "created",
  };
}

/**
 * Track shipment
 */
export async function trackShipment(trackingNumber) {
  const res = await request(`/shipments/track/${trackingNumber}`);

  return {
    success: true,
    trackingNumber,
    status: res.data?.status || "unknown",
    provider: "shexpress",
  };
}
