const BASE_URL = "https://shexpress.ma";

function getCredentials() {
  const token = process.env.SHEXPRESS_TOKEN;
  const secretKey = process.env.SHEXPRESS_SECRET_KEY;

  if (!token || !secretKey) {
    throw new Error("Missing SHEXPRESS_TOKEN or SHEXPRESS_SECRET_KEY");
  }

  return { token, secretKey };
}

function n(value) {
  const x = Number(String(value || "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(x) ? x : 0;
}

function readFirst(obj = {}, keys = []) {
  for (const key of keys) {
    if (
      obj?.[key] !== undefined &&
      obj?.[key] !== null &&
      String(obj[key]).trim() !== ""
    ) {
      return obj[key];
    }
  }

  return "";
}

function formatUnixDate(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return "";

  const d = new Date(raw * 1000);

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function normalizeStatus(status) {
  return String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isDelivered(status) {
  const s = normalizeStatus(status);

  return (
    s === "livre" ||
    s === "Livré" ||
    s === "Livré (Facturé)" ||
    s === "livre facture" ||
    s === "Livre facture" ||
    s === "livre facturee" ||
    s === "livre non facture" ||
    s === "livre non facturee"
  );
}

function isReportIgnored(status) {
  const s = normalizeStatus(status);

  return s === "ajoute";
}

function isFailedOrReturned(status) {
  const s = String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return (
    s.includes("demande de retour") ||
    s.includes("retour client") ||
    s.includes("hors zone") ||
    s.includes("faux destination") ||
    s.includes("refuse") ||
    s.includes("annule")
  );
}

function isDashboardFailed(status) {
  return isFailedOrReturned(status);
}

function mapColis(row = {}) {
  return {
    code: readFirst(row, ["code", "Code", "CODE", "tracking_number"]),
    customer_name: readFirst(row, [
      "customer_name",
      "fullname",
      "Fullname",
      "name",
      "Nom",
    ]),
    phone: readFirst(row, ["phone", "Phone", "telephone", "Tel"]),
    city: readFirst(row, ["city", "City", "ville", "Ville"]),
    address: readFirst(row, ["address", "Address", "adresse", "Adresse"]),
    product_name: readFirst(row, [
      "product_name",
      "product",
      "Product",
      "produit",
      "Produit",
    ]),
    product: readFirst(row, ["product", "Product", "produit", "Produit"]),
    quantity: n(readFirst(row, ["quantity", "qty", "Qty"])) || 1,
    price: n(readFirst(row, ["price", "Price", "prix", "Prix"])),
    status: readFirst(row, ["status", "State", "Etat", "etat"]),
    date_add_raw: readFirst(row, [
      "date_add",
      "DateAdd",
      "Date_Add",
      "dateadd",
    ]),
    date_update_raw: readFirst(row, [
      "date_update",
      "DateUpdate",
      "Date_Update",
      "dateupdate",
    ]),

    // Keep old names too so the rest of app does not break
    date_add: readFirst(row, ["date_add", "DateAdd", "Date_Add", "dateadd"]),
    date_update: readFirst(row, [
      "date_update",
      "DateUpdate",
      "Date_Update",
      "dateupdate",
    ]),
  };
}

function normalizeForApp(row) {
  return {
    code: row.code,
    customer_name: row.customer_name,
    phone: row.phone,
    city: row.city,
    address: row.address,
    product_name: row.product_name || row.product,
    quantity: row.quantity,
    price: row.price,
    status: row.status,
    date_add: row.date_add_raw,
    date_update: row.date_update_raw,
    date_add_day: formatUnixDate(row.date_add_raw),
    date_update_day: formatUnixDate(row.date_update_raw),
    raw: row,
  };
}

export async function listShipments() {
  const { token, secretKey } = getCredentials();

  const url = new URL(`${BASE_URL}/colislist.php`);
  url.searchParams.set("tk", token);
  url.searchParams.set("sk", secretKey);

  const res = await fetch(url);
  const text = await res.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`SHExpress did not return JSON: ${text.slice(0, 300)}`);
  }

  if (!Array.isArray(json)) {
    throw new Error(
      `SHExpress returned non-array response: ${JSON.stringify(json)}`,
    );
  }
  console.log("🔥 RAW SHEXPRESS FIRST ROW:", json[0]);
  console.log("🔥 RAW SHEXPRESS KEYS:", Object.keys(json[0] || {}));

  return json.map(mapColis).map(normalizeForApp);
}

// SAME IDEA AS calculateStats(rows, "date_update") IN YOUR TEST SCRIPT
export async function listShipmentsByDateRange(fromDate, toDate) {
  const rows = await listShipments();

  const from = fromDate || new Date().toISOString().slice(0, 10);
  const to = toDate || from;

  const filtered = rows.filter((r) => {
    const day = formatUnixDate(r.date_update);
    return day >= from && day <= to;
  });

  const deliveredRows = filtered.filter((r) => isDelivered(r.status));
  const failedRows = filtered.filter((r) => isFailedOrReturned(r.status));
  const inProgressRows = filtered.filter(
    (r) => !isDelivered(r.status) && !isFailedOrReturned(r.status),
  );

  console.log("✅ SHExpress date_update logic:", {
    from,
    to,
    raw_count: rows.length,
    total: filtered.length,
    revenue: deliveredRows.reduce((sum, r) => sum + n(r.price), 0),
    delivered: deliveredRows.length,
    in_progress: inProgressRows.length,
    failed: failedRows.length,
    status_counts: buildStatusCounts(filtered),
  });

  return filtered;
}

export async function listDeliveredShipmentsByDateRange(fromDate, toDate) {
  const rows = await listShipmentsByDateRange(fromDate, toDate);
  const deliveredRows = rows.filter((r) => isDelivered(r.status));

  console.log("✅ SHExpress delivered rows:", {
    from: fromDate,
    to: toDate,
    delivered: deliveredRows.length,
    revenue: deliveredRows.reduce((sum, r) => sum + n(r.price), 0),
    codes: deliveredRows.map((r) => r.code),
  });

  return deliveredRows;
}

export async function getShipmentsStatsByDateRange(fromDate, toDate) {
  const rows = await listShipmentsByDateRange(fromDate, toDate);

  // SHExpress dashboard excludes "Ajouté" from Total
  const reportRows = rows.filter((r) => !isReportIgnored(r.status));

  const deliveredRows = reportRows.filter((r) => isDelivered(r.status));

  const failedRows = reportRows.filter((r) => isFailedOrReturned(r.status));

  const inProgressRows = reportRows.filter(
    (r) => !isDelivered(r.status) && !isFailedOrReturned(r.status),
  );

  const deliveredRevenue = deliveredRows.reduce(
    (sum, r) => sum + n(r.price),
    0,
  );

  return {
    total_colis: reportRows.length,
    delivered: deliveredRows.length,
    in_progress: inProgressRows.length,
    failed_or_returned: failedRows.length,
    delivered_revenue: deliveredRevenue,
    delivery_rate:
      reportRows.length > 0
        ? Number(((deliveredRows.length / reportRows.length) * 100).toFixed(1))
        : 0,

    status_counts: buildStatusCounts(rows),
    data: rows,
  };
}

function buildStatusCounts(rows = []) {
  const statusCounts = {};

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }

  return statusCounts;
}

export async function listTodayShipments() {
  const today = new Date().toISOString().slice(0, 10);
  return listShipmentsByDateRange(today, today);
}

export async function listShipmentsFromDate(fromDate) {
  const today = new Date().toISOString().slice(0, 10);
  return listShipmentsByDateRange(fromDate, today);
}

export async function trackShipment(code) {
  const url = new URL(`${BASE_URL}/track.php`);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error("SHExpress tracking failed");
  }

  return data;
}

export async function createShipment(payload) {
  const { token, secretKey } = getCredentials();

  const code = payload.code || `CMD-${Date.now()}`;

  const url = new URL(`${BASE_URL}/addcolis.php`);
  url.searchParams.set("tk", token);
  url.searchParams.set("sk", secretKey);
  url.searchParams.set("code", code);
  url.searchParams.set("fullname", payload.name || payload.customer_name || "");
  url.searchParams.set("phone", payload.phone || "");
  url.searchParams.set("city", payload.city || "");
  url.searchParams.set("address", payload.address || "");
  url.searchParams.set(
    "price",
    String(payload.price || payload.total_price || 0),
  );
  url.searchParams.set(
    "product",
    payload.product || payload.product_name || "Order",
  );
  url.searchParams.set("qty", String(payload.quantity || 1));
  url.searchParams.set("note", payload.note || "");
  url.searchParams.set("change", "0");
  url.searchParams.set("openpackage", "1");

  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok || !text.toLowerCase().includes("package added")) {
    throw new Error(`SHExpress add failed: ${text}`);
  }

  return {
    trackingNumber: code,
    status: "created",
    raw: text,
  };
}
