import supabase from "../../supabase.js";
import { syncClientInvoices } from "./playwright/syncClientInvoices.js";

const STORAGE_BUCKET =
  process.env.SHEXPRESS_INVOICES_BUCKET || "client-invoices";

function positiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function serviceError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

export async function listInvoices({
  page = 1,
  limit = 10,
  status = "",
  search = "",
} = {}) {
  const safePage = positiveInteger(page, 1);
  const safeLimit = Math.min(positiveInteger(limit, 10), 100);

  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = supabase
    .from("client_invoices")
    .select("*", {
      count: "exact",
    })
    .order("invoice_created_at", {
      ascending: false,
      nullsFirst: false,
    })
    .range(from, to);

  if (status === "paid" || status === "unpaid") {
    query = query.eq("status", status);
  }

  const cleanSearch = String(search || "").trim();

  if (cleanSearch) {
    query = query.ilike("invoice_code", `%${cleanSearch}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  const { data: summaryRows, error: summaryError } = await supabase
    .from("client_invoices")
    .select("status,amount,parcel_count");

  if (summaryError) {
    throw summaryError;
  }

  const rows = summaryRows || [];

  const summary = {
    total: rows.length,

    paid: rows.filter((invoice) => invoice.status === "paid").length,

    unpaid: rows.filter((invoice) => invoice.status === "unpaid").length,

    totalAmount: rows.reduce(
      (sum, invoice) => sum + Number(invoice.amount || 0),
      0,
    ),

    totalParcels: rows.reduce(
      (sum, invoice) => sum + Number(invoice.parcel_count || 0),
      0,
    ),
  };

  return {
    data: data || [],
    summary,

    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / safeLimit)),
    },
  };
}

export async function synchronizeInvoices() {
  return syncClientInvoices();
}

export async function createInvoicePdfUrl(shexpressInvoiceId) {
  const invoiceId = String(shexpressInvoiceId || "").trim();

  if (!invoiceId) {
    throw serviceError("Invoice identifier is required", 400);
  }

  const { data: invoice, error } = await supabase
    .from("client_invoices")
    .select("shexpress_invoice_id,invoice_code,pdf_path")
    .eq("shexpress_invoice_id", invoiceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!invoice) {
    throw serviceError("Invoice not found", 404);
  }

  if (!invoice.pdf_path) {
    throw serviceError("The PDF is not available for this invoice yet", 404);
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(invoice.pdf_path, 60);

  if (signedUrlError) {
    throw signedUrlError;
  }

  if (!data?.signedUrl) {
    throw serviceError("Unable to generate invoice PDF URL", 500);
  }

  return {
    invoiceCode: invoice.invoice_code,
    signedUrl: data.signedUrl,
  };
}
