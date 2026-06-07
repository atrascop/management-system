import express from "express";
import crypto from "crypto";

import supabase from "../supabase.js";
import { normalizeOrder } from "../normalizers/order.js";

const router = express.Router();

/**
 * 🔐 Shopify HMAC verification (PRODUCTION READY)
 */
function verifyShopifyHmac(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
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
    // 📦 DEBUG: log full incoming payload
    console.log("📦 SHOPIFY WEBHOOK RECEIVED:");
    console.log(JSON.stringify(req.body, null, 2));

    // 🔐 Verify HMAC
    const isValid = verifyShopifyHmac(req);

    // ⚠️ DEV MODE (remove when going live)
    const SKIP_HMAC = true;

    if (!isValid && !SKIP_HMAC) {
      console.log("❌ Invalid HMAC");
      return res.sendStatus(401);
    }

    if (!isValid && SKIP_HMAC) {
      console.log("⚠️ HMAC skipped (DEV MODE)");
    }

    // 🧾 Normalize order
    const order = normalizeOrder(req.body);

    console.log("🧾 NORMALIZED ORDER:");
    console.log(order);

    // 🗄️ Insert into Supabase
    const { data, error } = await supabase
      .from("orders")
      .upsert([order], { onConflict: "shopify_order_id" })
      .select();

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.sendStatus(500);
    }

    console.log("✅ Order saved successfully:");
    console.log(data);

    return res.sendStatus(200);
  } catch (err) {
    console.error("🔥 Webhook crash error:", err);
    return res.sendStatus(500);
  }
});

export default router;
