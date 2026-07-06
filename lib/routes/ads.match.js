import express from "express";
import { matchAdsToProducts } from "../services/ads/ads.matcher.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await matchAdsToProducts(req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ MATCH ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Match failed",
    });
  }
});

export default router;
