import * as invoicesService from "../services/invoices/invoices.service.js";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function getInvoices(req, res) {
  try {
    const result = await invoicesService.listInvoices({
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      search: req.query.search,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("GET_CLIENT_INVOICES_ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: errorMessage(error) || "Failed to load client invoices",
    });
  }
}

export async function syncInvoices(req, res) {
  try {
    const result = await invoicesService.synchronizeInvoices();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("SYNC_CLIENT_INVOICES_ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: errorMessage(error) || "Failed to synchronize client invoices",
    });
  }
}

export async function downloadInvoicePdf(req, res) {
  try {
    const { shexpressInvoiceId } = req.params;

    const result =
      await invoicesService.createInvoicePdfUrl(shexpressInvoiceId);

    return res.redirect(result.signedUrl);
  } catch (error) {
    console.error("DOWNLOAD_CLIENT_INVOICE_ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: errorMessage(error) || "Failed to download invoice PDF",
    });
  }
}
