import { getShipmentByTracking } from "./shipment.service.js";
import * as provider from "./providers/shexpress.provider.js";

export async function trackShipment(trackingNumber) {
  const shipment = await getShipmentByTracking(trackingNumber);

  if (!shipment) {
    return {
      tracking_number: trackingNumber,
      status: "not_found",
      order_id: null,
      provider: null,
    };
  }

  const live = await provider.trackShipment(trackingNumber);

  return {
    tracking_number: shipment.tracking_number,
    status: live.status,
    order_id: shipment.order_id,
    provider: shipment.provider,
    created_at: shipment.created_at,
  };
}
