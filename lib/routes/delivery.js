import supabase from "../supabase.js";
import { Router } from "express";
import * as deliveryController from "../controllers/delivery.controller.js";
import {
  listTodayShipments,
  listShipmentsFromDate,
  listShipmentsByDateRange,
} from "../services/delivery/shexpress.client.js";
import { adjustProductStockForOrder } from "../services/products.service.js";
import * as deliveryService from "../services/delivery/delivery.service.js";
import { validateReturnSlip } from "../services/delivery/playwright/validateReturn.js";
const router = Router();

function isDelivered(status) {
  return String(status || "").trim() === "Livré";
}

function isFailed(status) {
  return ["Refusé", "Annulé", "Retour"].some((s) =>
    String(status || "").includes(s),
  );
}

function isInProgress(status) {
  return [
    "Ajouté",
    "Expédié",
    "Ramassé",
    "Mise en distribution",
    "Programmé",
    "Reporté",
    "Pas de réponse",
    "relancé",
  ].some((s) => String(status || "").includes(s));
}

function normalizeShipment(c) {
  return {
    code: c.Code,
    customer_name: c.Fullname,
    phone: c.Phone,
    city: c.City,
    address: c.Address,
    price: Number(c.Price || 0),
    status: c.State,
    date_add: c.DateAdd,
    date_update: c.DateUpdate,
  };
}

function buildSummary(data) {
  const delivered = data.filter((row) => isDelivered(row.status));
  const failed = data.filter((row) => isFailed(row.status));
  const inProgress = data.filter((row) => isInProgress(row.status));

  const deliveredRevenue = delivered.reduce(
    (sum, row) => sum + Number(row.price || 0),
    0,
  );

  return {
    total_colis: data.length,
    delivered: delivered.length,
    in_progress: inProgress.length,
    failed_or_returned: failed.length,
    delivered_revenue: deliveredRevenue,
    delivery_rate: data.length > 0 ? delivered.length / data.length : 0,
  };
}

function buildStatusCounts(data) {
  return data.reduce((acc, row) => {
    const status = row.status || "Unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

router.get("/shexpress/report", async (req, res) => {
  try {
    const from = req.query.from || "2026-06-08";
    const rows = await listShipmentsFromDate(from);
    const data = rows.map(normalizeShipment);

    return res.json({
      success: true,
      from,
      to: new Date().toISOString().slice(0, 10),
      summary: buildSummary(data),
      status_counts: buildStatusCounts(data),
    });
  } catch (err) {
    console.error("❌ SHExpress report error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate SHExpress report",
    });
  }
});

router.get("/shexpress", async (req, res) => {
  try {
    const from = req.query.from || "2026-06-08";
    const to = req.query.to || new Date().toISOString().slice(0, 10);

    const rows = await listShipmentsByDateRange(from, to);
    const data = rows.map(normalizeShipment);

    return res.json({
      success: true,
      from,
      to,
      count: data.length,
      summary: buildSummary(data),
      status_counts: buildStatusCounts(data),
      data,
    });
  } catch (err) {
    console.error("❌ SHExpress range error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch SHExpress shipments",
    });
  }
});

router.get("/shexpress/today", async (req, res) => {
  try {
    const rows = await listTodayShipments();
    const data = rows.map(normalizeShipment);

    return res.json({
      success: true,
      count: data.length,
      summary: buildSummary(data),
      status_counts: buildStatusCounts(data),
      data,
    });
  } catch (err) {
    console.error("❌ SHExpress today error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch SHExpress shipments",
    });
  }
});

router.get("/delivered", async (req, res) => {
  try {
    const data = await deliveryService.getDeliveredOrders({
      from: req.query.from,
      to: req.query.to,
    });

    return res.json({
      success: true,
      count: data.length,
      delivered_revenue: data.reduce(
        (sum, row) => sum + Number(row.price || 0),
        0,
      ),
      data,
    });
  } catch (err) {
    console.error("Delivered orders test error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * Frontend calls this route.
 * Keep it to avoid 404.
 */
router.post("/sync-statuses", async (req, res) => {
  try {
    const from =
      req.body?.from ||
      req.query?.from ||
      new Date().toISOString().slice(0, 10);

    const to = req.body?.to || req.query?.to || from;

    const rows = await deliveryService.getDeliveredOrders({ from, to });

    let synced = 0;
    let skipped = 0;
    const results = [];

    for (const row of rows) {
      const code = row.code;

      if (!code) {
        skipped++;
        continue;
      }

      const { data: order, error } = await supabase
        .from("orders")
        .select("*")
        .eq("tracking_number", code)
        .maybeSingle();

      if (error) throw error;

      if (!order) {
        skipped++;
        results.push({
          code,
          status: "skipped",
          reason: "No matching order by tracking_number",
        });
        continue;
      }

      const adjusted = await adjustProductStockForOrder(
        {
          ...order,
          tracking_number: code,
          quantity: order.quantity || row.quantity || 1,
        },
        "DELIVERED",
      );

      if (adjusted) {
        synced++;
        results.push({
          code,
          status: "stock_decreased",
          product: order.product_name,
        });
      } else {
        skipped++;
        results.push({
          code,
          status: "skipped",
          reason:
            adjusted === null
              ? "Already synced, product not found, or missing product data"
              : "Unknown",
        });
      }
    }

    return res.json({
      success: true,
      from,
      to,
      synced,
      skipped,
      total: rows.length,
      results,
    });
  } catch (err) {
    console.error("Delivery stock sync error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Delivery stock sync failed",
    });
  }
});

router.post("/create", deliveryController.createShipment);
router.get("/track/:trackingNumber", deliveryController.trackShipment);
router.post("/shexpress/validate-returns", async (req, res) => {
  try {
    const result = await validateReturnSlip();

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("Validate returns error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
export default router;
