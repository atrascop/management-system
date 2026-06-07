import express from "express";

import { getProducts } from "../services/products.service.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const products = await getProducts();

    res.json(products);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;
