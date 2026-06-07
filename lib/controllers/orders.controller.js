import { eventBus } from "../services/workflow/eventBus.js";
import { validate as isUUID } from "uuid";

export async function confirmOrder(req, res) {
  try {
    const { id } = req.params;

    // 1. Validate ID early (before DB call)
    if (!id || typeof id !== "string" || !isUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    // 2. Update order status in DB
    const updatedOrder = await dbUpdateOrderStatus(id, "confirmed");

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 3. Emit workflow event (this triggers shipment creation)
    eventBus.emit("order.confirmed", updatedOrder);

    return res.json({
      success: true,
      data: updatedOrder,
    });
  } catch (err) {
    console.error("❌ Confirm order error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}
