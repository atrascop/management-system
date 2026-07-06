import express from "express";

import {
  getProductProfitPerformance,
  getWinningProducts,
  getLosingProducts,
} from "../services/analytics/product-profit.service.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await getProductProfitPerformance(req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to calculate product profitability",
    });
  }
});

router.get("/winners", async (req, res) => {
  try {
    const data = await getWinningProducts(req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch winning products",
    });
  }
});

router.get("/losers", async (req, res) => {
  try {
    const data = await getLosingProducts(req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch losing products",
    });
  }
});

export default router;
