import express from "express";

import {
  getProductCampaignMappings,
  createProductCampaignMapping,
} from "../services/analytics/product-campaign-mapping.service.js";

const router = express.Router();

/*
GET ALL MAPPINGS
*/
router.get("/", async (req, res) => {
  try {
    const data = await getProductCampaignMappings();

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch mappings",
    });
  }
});

/*
CREATE MAPPING
*/
router.post("/", async (req, res) => {
  try {
    const data = await createProductCampaignMapping(req.body);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to create mapping",
    });
  }
});

export default router;
