// import express from "express";
// import crypto from "crypto";
// import supabase from "../supabase.js";
// import { normalizeOrder } from "../normalizers/order.js";

// const router = express.Router();

// /**
//  * 🔐 Verify Shopify HMAC
//  */
// function verifyShopifyHmac(req) {
//   const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
//   const hmacHeader = req.get("X-Shopify-Hmac-Sha256");

//   // IMPORTANT: raw body must be preserved by express middleware
//   const rawBody = req.rawBody || JSON.stringify(req.body);

//   if (!secret || !hmacHeader || !rawBody) {
//     console.log("⚠️ Missing HMAC requirements");
//     return false;
//   }

//   const hash = crypto
//     .createHmac("sha256", secret)
//     .update(rawBody, "utf8")
//     .digest("base64");

//   return hash === hmacHeader;
// }

// /**
//  * 🧾 Shopify Webhook: Order Create
//  */
// router.post("/orders/create", async (req, res) => {
//   console.log("\n🔥 WEBHOOK HIT: orders/create");

//   try {
//     console.log("📦 Headers:", {
//       topic: req.headers["x-shopify-topic"],
//       hmac: req.headers["x-shopify-hmac-sha256"],
//       type: req.headers["content-type"],
//     });

//     console.log("📨 Payload received");

//     // DEV MODE: skip HMAC for now
//     const SKIP_HMAC = true;

//     const isValid = verifyShopifyHmac(req);

//     if (!isValid && !SKIP_HMAC) {
//       console.log("❌ Invalid HMAC signature");
//       return res.sendStatus(401);
//     }

//     if (!isValid && SKIP_HMAC) {
//       console.log("⚠️ HMAC skipped (DEV MODE)");
//     }

//     // Normalize order safely
//     const order = normalizeOrder(req.body);

//     console.log("🧾 Normalized order:", {
//       id: order?.shopify_order_id,
//       total: order?.total_price,
//       customer: order?.customer_name,
//     });

//     // Save to Supabase
//     const { data, error } = await supabase
//       .from("orders")
//       .upsert([order], { onConflict: "shopify_order_id" })
//       .select();

//     if (error) {
//       console.error("❌ Supabase error:", error.message);
//       return res.sendStatus(500);
//     }

//     console.log("✅ Order saved:", data?.[0]?.shopify_order_id);

//     return res.sendStatus(200);
//   } catch (err) {
//     console.error("🔥 Webhook crash:", err.message);
//     return res.sendStatus(500);
//   }
// });

// export default router;

import express from "express";
import crypto from "crypto";
import supabase from "../supabase.js";
import { normalizeOrder } from "../normalizers/order.js";
import {
  decrementProductStockForOrder,
  ensureProductsFromShopifyOrder,
} from "../services/products.service.js";

const router = express.Router();

/**
 * 🔐 Verify Shopify HMAC
 */
function verifyShopifyHmac(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");

  // IMPORTANT: raw body must be preserved by express middleware
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!secret || !hmacHeader || !rawBody) return false;

  const generatedHash = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return generatedHash === hmacHeader;
}

/**
 * 🧾 Shopify Webhook: Order Create
 */
router.post("/orders/create", async (req, res) => {
  try {
    const isValid = verifyShopifyHmac(req);
    const SKIP_HMAC = true; // dev mode only

    if (!isValid && !SKIP_HMAC) {
      return res.sendStatus(401);
    }

    const order = normalizeOrder(req.body);
    const productsResult = await ensureProductsFromShopifyOrder(req.body);
    const { data: existingOrder, error: existingError } = await supabase
      .from("orders")
      .select("id")
      .eq("shopify_order_id", order.shopify_order_id)
      .maybeSingle();

    if (existingError) {
      console.error("Supabase error:", existingError.message);
      return res.sendStatus(500);
    }

    const { error } = await supabase.from("orders").upsert([order], {
      onConflict: "shopify_order_id",
    });

    if (error) {
      console.error("Supabase error:", error.message);
      return res.sendStatus(500);
    }

    if (!existingOrder) {
      await decrementProductStockForOrder(order);
    }

    return res.status(200).json({
      success: true,
      productsCreated: productsResult.created.length,
      productsSkipped: productsResult.skipped.length,
    });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.sendStatus(500);
  }
});

/**
 * 🔁 TEMP: Sync missing 6 orders from Shopify
 */
router.get("/sync-6-orders", async (req, res) => {
  try {
    const ids = [
      "6656661651503",
      "6656591593519",
      "6656430309423",
      "6656328433711",
      "6656286785583",
    ];

    const results = [];

    for (const id of ids) {
      const response = await fetch(
        `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2026-04/orders/${id}.json`,
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          },
        },
      );

      const data = await response.json();

      if (!data.order) continue;

      const order = normalizeOrder(data.order);
      await ensureProductsFromShopifyOrder(data.order);

      const { error } = await supabase.from("orders").upsert([order], {
        onConflict: "shopify_order_id",
      });

      if (!error) results.push(id);
    }

    res.json({
      success: true,
      synced: results,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
