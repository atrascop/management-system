import express from "express";
import crypto from "crypto";
import supabase from "../supabase.js";
import { normalizeOrder } from "../normalizers/order.js";

const router = express.Router();

/**
 * 🔐 Verify Shopify HMAC
 */
function verifyShopifyHmac(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");

  // IMPORTANT: raw body must be preserved by express middleware
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!secret || !hmacHeader || !rawBody) {
    console.log("⚠️ Missing HMAC requirements");
    return false;
  }

  const hash = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return hash === hmacHeader;
}

/**
 * 🧾 Shopify Webhook: Order Create
 */
router.post("/orders/create", async (req, res) => {
  console.log("\n🔥 WEBHOOK HIT: orders/create");

  try {
    console.log("📦 Headers:", {
      topic: req.headers["x-shopify-topic"],
      hmac: req.headers["x-shopify-hmac-sha256"],
      type: req.headers["content-type"],
    });

    console.log("📨 Payload received");

    // DEV MODE: skip HMAC for now
    const SKIP_HMAC = true;

    const isValid = verifyShopifyHmac(req);

    if (!isValid && !SKIP_HMAC) {
      console.log("❌ Invalid HMAC signature");
      return res.sendStatus(401);
    }

    if (!isValid && SKIP_HMAC) {
      console.log("⚠️ HMAC skipped (DEV MODE)");
    }

    // Normalize order safely
    const order = normalizeOrder(req.body);

    console.log("🧾 Normalized order:", {
      id: order?.shopify_order_id,
      total: order?.total_price,
      customer: order?.customer_name,
    });

    // Save to Supabase
    const { data, error } = await supabase
      .from("orders")
      .upsert([order], { onConflict: "shopify_order_id" })
      .select();

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return res.sendStatus(500);
    }

    console.log("✅ Order saved:", data?.[0]?.shopify_order_id);

    return res.sendStatus(200);
  } catch (err) {
    console.error("🔥 Webhook crash:", err.message);
    return res.sendStatus(500);
  }
});

export default router;
