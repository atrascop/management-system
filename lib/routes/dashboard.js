import express from "express";
import { getDashboardPerformance } from "../services/analytics/simple-dashboard.service.js";
import { autoSyncMetaAdsForRange } from "../services/ads.service.js";
// import { getDashboardPerformance } from "../services/analytics/simple-dashboard.service.js";
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    await autoSyncMetaAdsForRange(req.query);

    const data = await getDashboardPerformance(req.query);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ DASHBOARD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Failed to load dashboard",
    });
  }
});

export default router;
