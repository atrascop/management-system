import express from "express";
import { backfillDelivery } from "../services/backfill.service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message:
          "from and to are required. Example: /api/backfill?from=2026-06-08&to=2026-06-30",
      });
    }

    const result = await backfillDelivery({ from, to });

    return res.json({
      success: true,
      message: "Delivery backfill completed",
      result,
    });
  } catch (err) {
    console.error("Backfill error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
});

export default router;
