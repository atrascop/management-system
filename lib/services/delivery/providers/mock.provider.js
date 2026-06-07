export async function createShipment(order) {
  return {
    success: true,
    trackingNumber: `MOCK-${Date.now()}`,
    status: "created",
    provider: "mock",
    orderId: order.id,
  };
}

export async function trackShipment(trackingNumber) {
  return {
    success: true,
    trackingNumber,
    status: "in_transit",
    provider: "mock",
  };
}
