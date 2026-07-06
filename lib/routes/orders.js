import express from "express";
import {
  getOrders,
  getOrderById,
  updateOrder,
  confirmOrder as confirmOrderService,
} from "../services/orders.service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();
const FINAL_CONFIRMED_STATUSES = ["confirmed", "shipped", "delivered"];

// Public read route for dashboard/frontend demo
router.get("/", async (req, res) => {
  try {
    const result = await getOrders(req.query);
    const data = Array.isArray(result) ? result : result.data;

    return res.json({
      success: true,
      data,
      pagination: Array.isArray(result) ? undefined : result.pagination,
      summary: Array.isArray(result) ? undefined : result.summary,
    });
  } catch (err) {
    console.error("Get orders error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Public read route
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
    console.error("Get order error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Protected write route
router.post("/:id/confirm", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (FINAL_CONFIRMED_STATUSES.includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: "Order is already confirmed",
      });
    }

    const result = await confirmOrderService(id, req.body || {});

    return res.json({
      success: true,
      message: "Order confirmed and sent to SHExpress",
      data: result.order,
      shipment: result.shipment,
    });
  } catch (err) {
    console.error("Confirm error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
});

// Protected write route
router.post("/:id/reject", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (FINAL_CONFIRMED_STATUSES.includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: "Confirmed orders cannot be rejected",
      });
    }

    if (order.status === "rejected") {
      return res.status(409).json({
        success: false,
        message: "Order is already rejected",
      });
    }

    const updatedOrder = await updateOrder(id, {
      status: "rejected",
    });

    return res.json({
      success: true,
      message: "Order rejected successfully",
      data: updatedOrder,
    });
  } catch (err) {
    console.error("Reject error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
