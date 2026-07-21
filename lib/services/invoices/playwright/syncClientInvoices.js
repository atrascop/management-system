import supabase from "../../../supabase.js";
import { ensureShexpressLogin } from "../../delivery/playwright/login.js";

const INVOICES_URL = "https://shexpress.ma/is-admin/factures.php?type=FC";

const SHEXPRESS_ADMIN_URL = "https://shexpress.ma/is-admin/";

const STORAGE_BUCKET =
  process.env.SHEXPRESS_INVOICES_BUCKET || "client-invoices";

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNumber(value) {
  const cleaned = cleanText(value)
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : 0;
}

function normalizeInvoiceStatus(value) {
  const status = normalizeText(value);

  // Must be checked first because "non versee" contains "versee".
  if (status.includes("non versee")) {
    return "unpaid";
  }

  if (status.includes("versee")) {
    return "paid";
  }

  return "unknown";
}

function parseFrenchDate(value) {
  const raw = cleanText(value);

  if (!raw || raw === "—" || raw === "-") {
    return null;
  }

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);

  if (!match) {
    return null;
  }

  const [, day, month, year, hour = "00", minute = "00"] = match;

  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+01:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function buildShexpressUrl(path) {
  if (!path) {
    return null;
  }

  try {
    return new URL(path, SHEXPRESS_ADMIN_URL).toString();
  } catch {
    return null;
  }
}

function safeFilename(value) {
  return cleanText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-");
}

function isPdfBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer.subarray(0, 4).toString("utf8") === "%PDF"
  );
}

async function createInvoicePdfBuffer(context, printUrl) {
  /*
   * First check whether SHExpress directly returns a PDF.
   */
  const response = await context.request.get(printUrl, {
    timeout: 60_000,
  });

  if (!response.ok()) {
    throw new Error(`Invoice request failed with status ${response.status()}`);
  }

  const contentType = String(
    response.headers()["content-type"] || "",
  ).toLowerCase();

  const responseBuffer = await response.body();

  if (contentType.includes("application/pdf") || isPdfBuffer(responseBuffer)) {
    return responseBuffer;
  }

  /*
   * Otherwise, SHExpress returned a printable HTML page.
   * Open it and generate a PDF using Playwright.
   */
  const invoicePage = await context.newPage();

  try {
    await invoicePage.goto(printUrl, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    await invoicePage.emulateMedia({
      media: "print",
    });

    return await invoicePage.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
    });
  } finally {
    await invoicePage.close();
  }
}

async function uploadInvoicePdf({
  context,
  invoiceId,
  invoiceCode,
  printPath,
}) {
  const printUrl = buildShexpressUrl(printPath);

  if (!printUrl) {
    throw new Error("Invalid or missing invoice print URL");
  }

  const pdfBuffer = await createInvoicePdfBuffer(context, printUrl);

  const storagePath = `${safeFilename(invoiceId)}/${safeFilename(invoiceCode)}.pdf`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return storagePath;
}

function invoiceChanged(existing, next) {
  if (!existing) {
    return true;
  }

  if (Number(existing.parcel_count || 0) !== Number(next.parcel_count || 0)) {
    return true;
  }

  if (Number(existing.amount || 0) !== Number(next.amount || 0)) {
    return true;
  }

  const fields = [
    "invoice_code",
    "agency",
    "note",
    "invoice_created_at",
    "invoice_created_label",
    "paid_at",
    "paid_at_label",
    "status",
    "status_label",
    "print_path",
    "export_path",
    "pdf_path",
  ];

  return fields.some((field) => {
    const existingValue = existing[field] ?? null;
    const nextValue = next[field] ?? null;

    return String(existingValue) !== String(nextValue);
  });
}

async function scrapeInvoices(page) {
  const invoiceRows = page.locator(
    'tbody tr:has(a[href*="printfactures.php"])',
  );

  const rowCount = await invoiceRows.count();

  if (rowCount === 0) {
    return [];
  }

  return invoiceRows.evaluateAll((rows) =>
    rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));

        const checkbox = row.querySelector('input[name="coli"]');

        const printLink = row.querySelector('a[href*="printfactures.php"]');

        const exportLink = row.querySelector('a[href*="exportfactures.php"]');

        return {
          shexpressInvoiceId: checkbox?.getAttribute("value") || "",

          invoiceCode: cells[1]?.textContent?.trim() || "",

          parcelCount: cells[2]?.textContent?.trim() || "0",

          amount: cells[3]?.textContent?.trim() || "0",

          agency: cells[4]?.textContent?.trim() || "",

          note: cells[5]?.textContent?.trim() || "",

          createdAt: cells[6]?.textContent?.trim() || "",

          paidAt: cells[7]?.textContent?.trim() || "",

          statusLabel: cells[8]?.textContent?.trim() || "",

          printPath: printLink?.getAttribute("href") || "",

          exportPath: exportLink?.getAttribute("href") || "",
        };
      })
      .filter((invoice) => invoice.shexpressInvoiceId && invoice.invoiceCode),
  );
}

export async function syncClientInvoices() {
  const { browser, page } = await ensureShexpressLogin();

  try {
    await page.goto(INVOICES_URL, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    await page.locator("table tbody").first().waitFor({
      state: "visible",
      timeout: 30_000,
    });

    const rawInvoices = await scrapeInvoices(page);

    const invoices = rawInvoices.map((invoice) => {
      const createdLabel = cleanText(invoice.createdAt);
      const paidLabel = cleanText(invoice.paidAt);

      return {
        shexpress_invoice_id: cleanText(invoice.shexpressInvoiceId),

        invoice_code: cleanText(invoice.invoiceCode),

        parcel_count: Math.trunc(parseNumber(invoice.parcelCount)),

        amount: parseNumber(invoice.amount),

        agency: cleanText(invoice.agency) || null,

        note: cleanText(invoice.note) || null,

        invoice_created_at: parseFrenchDate(invoice.createdAt),

        invoice_created_label: createdLabel || null,

        paid_at: parseFrenchDate(invoice.paidAt),

        paid_at_label: paidLabel && paidLabel !== "—" ? paidLabel : null,

        status: normalizeInvoiceStatus(invoice.statusLabel),

        status_label: cleanText(invoice.statusLabel) || "Unknown",

        print_path: cleanText(invoice.printPath) || null,

        export_path: cleanText(invoice.exportPath) || null,
      };
    });

    if (invoices.length === 0) {
      return {
        success: true,
        found: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        pdfDownloaded: 0,
        pdfFailed: 0,
        results: [],
      };
    }

    const invoiceIds = invoices.map((invoice) => invoice.shexpress_invoice_id);

    const { data: existingInvoices, error: readError } = await supabase
      .from("client_invoices")
      .select("*")
      .in("shexpress_invoice_id", invoiceIds);

    if (readError) {
      throw readError;
    }

    const existingById = new Map(
      (existingInvoices || []).map((invoice) => [
        String(invoice.shexpress_invoice_id),
        invoice,
      ]),
    );

    const context = page.context();

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let pdfDownloaded = 0;
    let pdfFailed = 0;

    const results = [];

    for (const invoice of invoices) {
      const existing = existingById.get(invoice.shexpress_invoice_id);

      let pdfPath = existing?.pdf_path || null;
      let pdfError = null;

      /*
       * Download the PDF only when:
       * - the invoice is new, or
       * - the PDF is missing.
       */
      if (!pdfPath && invoice.print_path) {
        try {
          pdfPath = await uploadInvoicePdf({
            context,
            invoiceId: invoice.shexpress_invoice_id,
            invoiceCode: invoice.invoice_code,
            printPath: invoice.print_path,
          });

          pdfDownloaded++;
        } catch (error) {
          pdfFailed++;

          pdfError = error instanceof Error ? error.message : String(error);

          console.error("❌ Invoice PDF failed:", {
            code: invoice.invoice_code,
            error: pdfError,
          });
        }
      }

      const payload = {
        ...invoice,
        pdf_path: pdfPath,
      };

      if (!invoiceChanged(existing, payload)) {
        unchanged++;

        results.push({
          id: invoice.shexpress_invoice_id,
          code: invoice.invoice_code,
          status: invoice.status,
          statusLabel: invoice.status_label,
          pdfPath,
          pdfError,
          action: "unchanged",
        });

        continue;
      }

      const { error: saveError } = await supabase
        .from("client_invoices")
        .upsert(
          {
            ...payload,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "shexpress_invoice_id",
          },
        );

      if (saveError) {
        throw saveError;
      }

      if (existing) {
        updated++;
      } else {
        inserted++;
      }

      console.log("✅ Invoice synchronized:", {
        code: invoice.invoice_code,
        status: invoice.status_label,
        amount: invoice.amount,
        pdfPath,
      });

      results.push({
        id: invoice.shexpress_invoice_id,
        code: invoice.invoice_code,
        status: invoice.status,
        statusLabel: invoice.status_label,
        pdfPath,
        pdfError,
        action: existing ? "updated" : "inserted",
      });
    }

    return {
      success: true,
      found: invoices.length,
      inserted,
      updated,
      unchanged,
      pdfDownloaded,
      pdfFailed,
      storageBucket: STORAGE_BUCKET,
      results,
    };
  } finally {
    await browser.close();
  }
}
