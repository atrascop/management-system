import * as deliveryService from "../services/delivery/delivery.service.js";

export async function createShipment(req, res) {
  try {
    const data = await deliveryService.createShipment(req.body);

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("CREATE_SHIPMENT_ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create shipment",
    });
  }
}

export async function trackShipment(req, res) {
  try {
    const { trackingNumber } = req.params;

    const data = await deliveryService.trackShipment(trackingNumber);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("TRACK_SHIPMENT_ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to track shipment",
    });
  }
}
