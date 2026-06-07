import crypto from "crypto";

export default function verifyShopifyHmac(req, res, next) {
  const hmac = req.get("X-Shopify-Hmac-Sha256");

  const generated = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody, "utf8")
    .digest("base64");

  if (generated !== hmac) {
    return res.status(401).send("Invalid HMAC");
  }

  next();
}
