import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Routes
import ordersRoute from "./lib/routes/orders.js";
import productsRoute from "./lib/routes/products.js";
import shopifyRoute from "./lib/routes/shopify.js";
import adsRoute from "./lib/routes/ads.js";
import deliveryRoute from "./lib/routes/delivery.js";
import adsMatchRoutes from "./lib/routes/ads.match.js";
import roasRoutes from "./lib/routes/roas.js";

import authRoutes from "./lib/routes/auth.js";

// Workflows
import { initWorkflows } from "./lib/services/workflow/workflow.registry.js";

const app = express();
console.log("🔐 JWT exists:", !!process.env.JWT_SECRET);

console.log("🟢 SERVER BOOT START");

/**
 * SECURITY / MIDDLEWARE
 */
app.use(
  cors({
    origin: "*", // safe for demo + Shopify + Render
    credentials: false,
  }),
);

app.use(express.json());

/**
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Store Management API is running",
  });
});

/**
 * API ROUTES
 */
app.use("/api/orders", ordersRoute);
app.use("/api/products", productsRoute);

app.use("/api/ads", adsRoute);
app.use("/api/ads/match", adsMatchRoutes);

app.use("/api/delivery", deliveryRoute);
app.use("/api", roasRoutes);

/**
 * SHOPIFY WEBHOOKS
 * Final endpoint:
 * POST /api/shopify/webhook
 */
app.use("/webhooks/shopify", shopifyRoute);
app.use("/api/shopify", shopifyRoute);

app.use("/api/auth", authRoutes);

/**
 * INIT WORKFLOWS (EVENT SYSTEM - SAFE INIT)
 */
try {
  initWorkflows();
  console.log("🧠 Workflows initialized");
} catch (err) {
  console.error("❌ Workflow init error:", err.message);
}

/**
 * START SERVER (RENDER SAFE)
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
