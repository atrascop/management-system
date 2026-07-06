import { Router } from "express";
import { getReturns } from "../controllers/returns.controller.js";

const router = Router();

router.get("/", getReturns);

export default router;
