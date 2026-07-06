import { eventBus } from "./eventBus.js";
import { createShipment } from "../delivery/delivery.service.js";

let initialized = false;
console.log("🧠 registry file loaded");
console.log("🚨 WORKFLOW EXECUTION START");

export function initWorkflows() {
  console.log("BEFORE REGISTER:", eventBus.listenerCount("order.confirmed"));

  if (initialized) {
    console.log("⚠️ Workflows already initialized — skipping");
    return;
  }

  initialized = true;

  eventBus.removeAllListeners("order.confirmed");

  eventBus.on("order.confirmed", async (payload) => {
    const order = payload.order || payload;

    try {
      await createShipment(order);
    } catch (err) {
      console.error("Shipment workflow failed:", err.message);
    }
  });

  console.log("AFTER REGISTER:", eventBus.listenerCount("order.confirmed"));

  console.log("🧠 Workflows initialized");
}
