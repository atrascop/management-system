import express from "express";

import {
  getAdsSpend,
  createAd,
  deleteAd,
  getCampaignAdsSummary,
  syncMetaAdsForRange,
} from "../services/ads.service.js";

const router = express.Router();

router.get("/campaigns", async (req, res) => {
  try {
    const data = await getCampaignAdsSummary(req.query);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ GET CAMPAIGNS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign summary",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const data = await getAdsSpend(req.query);

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

router.post("/sync", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const from = req.body?.from || req.query?.from || today;
    const to = req.body?.to || req.query?.to || from;

    const result = await syncMetaAdsForRange({
      from,
      to,
    });

    return res.json({
      success: true,
      synced: result.synced || 0,
      from: result.from,
      to: result.to,
    });
  } catch (err) {
    console.error("❌ META SYNC ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Failed to sync Meta ads",
    });
  }
});

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

export default router;
