import * as deliveryService from "../services/delivery/delivery.service.js";

export async function createShipment(req, res) {
  try {
    const shipment = await deliveryService.createShipment(req.body);

    res.json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function trackShipment(req, res) {
  try {
    const shipment = await deliveryService.trackShipment(
      req.params.trackingNumber,
    );

    res.json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
