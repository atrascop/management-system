import express from "express";

import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductStock,
  backfillProductsFromOrders,
} from "../services/products.service.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const products = await getProducts();

    res.json({
      success: true,
      data: products,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const product = await createProduct(req.body);

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/backfill-from-orders", async (req, res) => {
  try {
    const result = await backfillProductsFromOrders();

    res.json({
      success: true,
      created: result.created.length,
      skipped: result.skipped.length,
      data: result.created,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});
router.post("/:id/add-stock", async (req, res) => {
  try {
    const quantity = Number(req.body.quantity || 0);

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quantity",
      });
    }

    const product = await addProductStock(req.params.id, quantity);

    return res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Add stock error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add stock",
    });
  }
});
router.put("/:id", async (req, res) => {
  try {
    const product = await updateProduct(req.params.id, req.body);

    res.json({
      success: true,
      data: product,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await deleteProduct(req.params.id);

    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
