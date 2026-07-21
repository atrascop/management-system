import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import "./jobs/cron.js";

import returnsRoute from "./lib/routes/returns.js";
import dashboardRoutes from "./lib/routes/dashboard.js";
// import deliveryRoutes from "./lib/routes/delivery.js";
import productProfitRoutes from "./lib/routes/product-profit.js";
import productCampaignMappingRoutes from "./lib/routes/product-campaign-mappings.js";
dotenv.config();

process.on("unhandledRejection", (reason) => {
  console.error("🔥 UNHANDLED REJECTION:");
  console.error(reason);
});

process.on("uncaughtException", (error) => {
  console.error("🔥 UNCAUGHT EXCEPTION:");
  console.error(error);
});

import ordersRoute from "./lib/routes/orders.js";
import productsRoute from "./lib/routes/products.js";
import shopifyRoute from "./lib/routes/shopify.js";
import adsRoutes from "./lib/routes/ads.js";
import deliveryRoute from "./lib/routes/delivery.js";
import adsMatchRoutes from "./lib/routes/ads.match.js";
import roasRoutes from "./lib/routes/roas.js";
import authRoutes from "./lib/routes/auth.js";
import backfillRoutes from "./lib/routes/backfill.js";
import invoicesRoute from "./lib/routes/invoices.js";
const app = express();
const PORT = Number(process.env.PORT || 3000);

console.log("🟢 SERVER BOOT START");
console.log("🔐 JWT exists:", !!process.env.JWT_SECRET);

app.use(
  cors({
    origin: "*",
    credentials: false,
  }),
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Store Management API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "store-management-api",
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.use("/api/orders", ordersRoute);
app.use("/api/products", productsRoute);
app.use("/api/ads", adsRoutes);
app.use("/api/ads/match", adsMatchRoutes);
app.use("/api/delivery", deliveryRoute);
app.use("/api", roasRoutes);
app.use("/webhooks/shopify", shopifyRoute);
app.use("/api/shopify", shopifyRoute);
app.use("/api/auth", authRoutes);
app.use("/api/returns", returnsRoute);
app.use("/api/backfill", backfillRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/invoices", invoicesRoute);

app.use("/api/product-profit", productProfitRoutes);
app.use("/api/product-campaign-mappings", productCampaignMappingRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error("❌ EXPRESS ERROR:");
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("🕒 Workflows and cron are enabled.");
});
