import { Router } from "express";
import * as invoicesController from "../controllers/invoices.controller.js";

const router = Router();

router.get("/", invoicesController.getInvoices);

router.post("/sync", invoicesController.syncInvoices);

router.get("/:shexpressInvoiceId/pdf", invoicesController.downloadInvoicePdf);

export default router;
