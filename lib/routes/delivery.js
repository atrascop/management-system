import express from "express";
import { trackShipment } from "../services/delivery/delivery.service.js";

const router = express.Router();

/**
 * TRACK SHIPMENT
 * GET /api/delivery/track/:trackingNumber
 */
router.get("/track/:trackingNumber", async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const data = await trackShipment(trackingNumber);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ Tracking error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Tracking failed",
    });
  }
});

export default router;
