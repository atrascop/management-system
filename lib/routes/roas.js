import express from "express";
import { calculateROASPerProduct } from "../services/analytics/roas.service.js";

const router = express.Router();

/**
 * GET ROAS PER PRODUCT
 */
router.get("/roas", async (req, res) => {
  try {
    const data = await calculateROASPerProduct();

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ ROAS ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;
