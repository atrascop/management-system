import { eventBus } from "./eventBus.js";
import { createShipment } from "../delivery/delivery.gateway.js";

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

    await createShipment(order);
  });

  console.log("AFTER REGISTER:", eventBus.listenerCount("order.confirmed"));

  console.log("🧠 Workflows initialized");
}
