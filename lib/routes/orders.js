import express from "express";
import {
  getOrders,
  getOrderById,
  updateOrder,
} from "../services/orders.service.js";
import { eventBus } from "../services/workflow/eventBus.js";

const router = express.Router();

/**
 * GET ALL ORDERS
 */
router.get("/", async (req, res) => {
  try {
    const data = await getOrders();

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ Get orders error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET SINGLE ORDER (optional but useful for debugging)
 */
router.get("/:id", async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      data: order,
    });
  } catch (err) {
    console.error("❌ Get order error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * CONFIRM ORDER
 * → triggers workflow (shipment + downstream systems)
 */
router.post("/:id/confirm", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔥 CONFIRM ROUTE ID =", id);

    // 1. Fetch order
    const order = await getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 2. Update status
    const updatedOrder = await updateOrder(id, {
      status: "confirmed",
    });

    // 3. Emit event (workflow trigger)
    console.log(
      "📤 EMIT order.confirmed | listeners:",
      eventBus.listenerCount("order.confirmed"),
    );

    eventBus.emit("order.confirmed", {
      order: updatedOrder,
    });

    // 4. Response
    return res.json({
      success: true,
      message: "Order confirmed successfully",
      data: updatedOrder,
    });
  } catch (err) {
    console.error("❌ Confirm error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
