import supabase from "../supabase.js";
import { Router } from "express";
import * as deliveryController from "../controllers/delivery.controller.js";
import {
  listTodayShipments,
  listShipmentsFromDate,
  listShipmentsByDateRange,
  getShipmentsStatsByDateRange,
} from "../services/delivery/shexpress.client.js";
import { adjustProductStockForOrder } from "../services/products.service.js";
import * as deliveryService from "../services/delivery/delivery.service.js";
import { validateReturnSlip } from "../services/delivery/playwright/validateReturn.js";
const router = Router();

function readFirst(obj = {}, keys = []) {
  for (const key of keys) {
    const value = obj?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isDelivered(status) {
  const s = normalizeText(status);

  return (
    s === "Livré" ||
    s === "Livré (Facturé)" ||
    s === "Livré Livré (Facturé)" ||
    s === "livre non facture" ||
    s === "livre non facturee"
  );
}

function isFailed(status) {
  const s = normalizeText(status);

  return (
    s.includes("refuse") ||
    s.includes("annule") ||
    s.includes("annuler") ||
    s.includes("retour") ||
    s.includes("echoue")
  );
}

function isInProgress(status) {
  return !isDelivered(status) && !isFailed(status);
}

function normalizeShipment(c = {}) {
  return {
    code: readFirst(c, ["code", "Code", "CODE", "tracking_number"]),
    customer_name: readFirst(c, [
      "customer_name",
      "fullname",
      "Fullname",
      "name",
      "Nom",
    ]),
    phone: readFirst(c, ["phone", "Phone", "telephone", "Tel"]),
    city: readFirst(c, ["city", "City", "ville", "Ville"]),
    address: readFirst(c, ["address", "Address", "adresse", "Adresse"]),
    product_name: readFirst(c, [
      "product_name",
      "product",
      "Product",
      "produit",
      "Produit",
    ]),
    quantity: Number(readFirst(c, ["quantity", "qty", "Qty"]) || 1),
    price: Number(readFirst(c, ["price", "Price", "prix", "Prix"]) || 0),
    status: readFirst(c, ["status", "State", "Etat", "etat"]),
    date_add: readFirst(c, ["date_add", "DateAdd", "Date_Add", "dateadd"]),
    date_update: readFirst(c, [
      "date_update",
      "DateUpdate",
      "Date_Update",
      "dateupdate",
    ]),
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
function toDay(value) {
  if (!value) return "";

  const text = String(value).trim();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);

  if (match) return match[0];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function toUnixSeconds(value) {
  const date = new Date(value || Date.now());

  if (Number.isNaN(date.getTime())) {
    return String(Math.floor(Date.now() / 1000));
  }

  return String(Math.floor(date.getTime() / 1000));
}

function mapOrderStatusToShexpress(status) {
  const s = String(status || "")
    .toLowerCase()
    .trim();

  if (s === "delivered") return "Livré";
  if (s === "returned" || s === "refused") return "Refusé";
  if (s === "cancelled" || s === "canceled") return "Annulé";
  if (s === "shipped") return "Expédié";
  if (s === "confirmed") return "Ajouté";
  if (s === "pending") return "Ajouté";

  return status || "Unknown";
}

function fallbackOrderDate(order) {
  return (
    order.delivered_at ||
    order.delivery_synced_at ||
    order.updated_at ||
    order.created_at
  );
}

function normalizeOrderAsShipment(order) {
  const dateForFilter = fallbackOrderDate(order);
  const date_add = toUnixSeconds(order.created_at || dateForFilter);
  const date_update = toUnixSeconds(dateForFilter);

  return {
    code: order.tracking_number || order.shopify_order_id || order.id,
    customer_name:
      order.customer_name || order.name || order.customer || "Unknown",
    phone: order.phone || order.customer_phone || "",
    city: order.city || "",
    address: order.address || "",
    price: Number(order.total_price || order.product_price || order.price || 0),
    status: mapOrderStatusToShexpress(order.status),
    date_add,
    date_update,
    _day: toDay(dateForFilter),
  };
}

async function listShipmentsFromOrdersDb(from, to) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  return (data || [])
    .map(normalizeOrderAsShipment)
    .filter((row) => {
      if (from && row._day < from) return false;
      if (to && row._day > to) return false;
      return true;
    })
    .map(({ _day, ...row }) => row);
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
    const from = toDay(req.query.from) || new Date().toISOString().slice(0, 10);
    const to = toDay(req.query.to || req.query.from) || from;

    const stats = await getShipmentsStatsByDateRange(from, to);

    return res.json({
      success: true,
      from,
      to,
      count: stats.data.length,
      summary: {
        total_colis: stats.total_colis,
        delivered: stats.delivered,
        in_progress: stats.in_progress,
        failed_or_returned: stats.failed_or_returned,
        delivered_revenue: stats.delivered_revenue,
        delivery_rate: stats.delivery_rate,
      },
      status_counts: stats.status_counts,
      data: stats.data,
    });
  } catch (err) {
    console.error("❌ SHExpress /shexpress error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch SHExpress shipments",
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
    console.warn("SHExpress today unavailable, using orders DB:", err.message);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const data = await listShipmentsFromOrdersDb(today, today);

      return res.json({
        success: true,
        count: data.length,
        summary: buildSummary(data),
        status_counts: buildStatusCounts(data),
        data,
      });
    } catch (fallbackError) {
      console.error("❌ Delivery today fallback error:", fallbackError);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch delivery shipments",
      });
    }
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
      updated: synced,
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
