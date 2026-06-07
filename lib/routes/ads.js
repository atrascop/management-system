import express from "express";

import {
  getAdsSpend,
  createAd,
  deleteAd,
  saveAdsInsights,
} from "../services/ads.service.js";

import { fetchMetaAdsInsights } from "../services/metaAds.service.js";

const router = express.Router();

/**
 * GET ALL ADS (Dashboard)
 */
router.get("/", async (req, res) => {
  try {
    const data = await getAdsSpend();

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ GET ADS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch ads",
    });
  }
});

/**
 * CREATE MANUAL AD (DEBUG / TEST ONLY)
 */
router.post("/", async (req, res) => {
  try {
    const { campaign_name, spend, date } = req.body;

    const data = await createAd({
      campaign_name,
      spend: Number(spend || 0),
      date,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ CREATE AD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to create ad",
    });
  }
});

/**
 * DELETE AD
 */
router.delete("/:id", async (req, res) => {
  try {
    await deleteAd(req.params.id);

    return res.json({
      success: true,
      message: "Ad deleted",
    });
  } catch (err) {
    console.error("❌ DELETE AD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to delete ad",
    });
  }
});

/**
 * SYNC META ADS → DATABASE (RAW INGESTION)
 */
router.post("/sync", async (req, res) => {
  try {
    const insights = await fetchMetaAdsInsights();

    if (!insights || !insights.length) {
      return res.json({
        success: true,
        message: "No insights found",
        synced: 0,
      });
    }

    await saveAdsInsights(insights);

    return res.json({
      success: true,
      synced: insights.length,
    });
  } catch (err) {
    console.error("❌ META SYNC ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to sync Meta ads",
    });
  }
});

export default router;
