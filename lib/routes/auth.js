import express from "express";
import { loginUser } from "../services/auth.service.js";

const router = express.Router();

/**
 * LOGIN
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser(email, password);

    if (!result) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
