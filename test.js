// backend/test-shexpress-stats.js
// Run: node test-shexpress-stats.js 2026-07-09

const TOKEN = "c083f7a8436ed4722419e5458552fc9d";
const SECRET_KEY = "e311975019c065d67b7446b828f1fd45";

const targetDate = process.argv[2] || new Date().toISOString().slice(0, 10);

if (!TOKEN || !SECRET_KEY) {
  console.error("❌ Missing SHEXPRESS_TOKEN or SHEXPRESS_SECRET_KEY in .env");
  process.exit(1);
}

function n(value) {
  const x = Number(String(value || "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(x) ? x : 0;
}

function readFirst(obj, keys) {
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

  // SHExpress sometimes returns unix seconds.
  const d = new Date(raw * 1000);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function normalizeStatus(status) {
  return String(status || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isDelivered(status) {
  const s = normalizeStatus(status);
  return s.includes("livre");
}

function isDeliveredFactured(status) {
  const s = normalizeStatus(status);
  return s.includes("livre") && s.includes("facture");
}

function isFailedOrReturned(status) {
  const s = normalizeStatus(status);

  return (
    s.includes("refuse") ||
    s.includes("annule") ||
    s.includes("annuler") ||
    s.includes("retour") ||
    s.includes("echoue")
  );
}

function mapColis(row) {
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
    product: readFirst(row, ["product", "Product", "produit", "Produit"]),
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
  };
}

function calculateStats(rows, dateField) {
  const filtered = rows.filter((r) => {
    const rawDate =
      dateField === "date_update" ? r.date_update_raw : r.date_add_raw;
    return formatUnixDate(rawDate) === targetDate;
  });

  const deliveredRows = filtered.filter((r) => isDelivered(r.status));
  const deliveredFacturedRows = filtered.filter((r) =>
    isDeliveredFactured(r.status),
  );
  const deliveredNotFacturedRows = deliveredRows.filter(
    (r) => !isDeliveredFactured(r.status),
  );
  const failedRows = filtered.filter((r) => isFailedOrReturned(r.status));
  const inProgressRows = filtered.filter(
    (r) => !isDelivered(r.status) && !isFailedOrReturned(r.status),
  );

  const revenue = deliveredRows.reduce((sum, r) => sum + n(r.price), 0);

  const statusCounts = {};
  for (const row of filtered) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }

  return {
    dateField,
    targetDate,
    total: filtered.length,
    revenue,
    delivered: deliveredRows.length,
    deliveredFactured: deliveredFacturedRows.length,
    deliveredNotFactured: deliveredNotFacturedRows.length,
    inProgress: inProgressRows.length,
    failed: failedRows.length,
    deliveryRate:
      filtered.length > 0
        ? Number(((deliveredRows.length / filtered.length) * 100).toFixed(1))
        : 0,
    statusCounts,
    deliveredRows,
    failedRows,
  };
}

async function main() {
  const url = new URL("https://shexpress.ma/colislist.php");
  url.searchParams.set("tk", TOKEN);
  url.searchParams.set("sk", SECRET_KEY);

  console.log("🔄 Fetching SHExpress colislist...");
  console.log("📅 Target date:", targetDate);

  const res = await fetch(url);
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("❌ SHExpress did not return JSON.");
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  if (!Array.isArray(json)) {
    console.error("❌ SHExpress returned non-array response:");
    console.dir(json, { depth: 5 });
    process.exit(1);
  }

  const rows = json.map(mapColis);

  console.log("✅ Raw colis count from API:", rows.length);

  const byDateAdd = calculateStats(rows, "date_add");
  const byDateUpdate = calculateStats(rows, "date_update");

  console.log("\n==============================");
  console.log("📌 STATS USING date_add");
  console.log("==============================");
  printStats(byDateAdd);

  console.log("\n==============================");
  console.log("📌 STATS USING date_update");
  console.log("==============================");
  printStats(byDateUpdate);

  console.log("\n🎯 SHExpress admin expected:");
  console.log({
    revenue: 937,
    deliveredFactured: 0,
    deliveredNotFactured: 5,
    total: 90,
    inProgress: 82,
    delivered: 5,
    failed: 3,
  });

  console.log(
    "\n✅ Compare the expected numbers with date_add and date_update above.",
  );
}

function printStats(stats) {
  console.log({
    total_chiffre_affaires: `${stats.revenue} DH`,
    colis_livres_factures: stats.deliveredFactured,
    colis_livres_non_factures: stats.deliveredNotFactured,
    total: stats.total,
    en_cours: stats.inProgress,
    livres: stats.delivered,
    echoues: stats.failed,
    delivery_rate: `${stats.deliveryRate}%`,
  });

  console.log("\nStatus counts:");
  console.table(stats.statusCounts);

  console.log("\nDelivered rows:");
  console.table(
    stats.deliveredRows.map((r) => ({
      code: r.code,
      status: r.status,
      price: r.price,
      city: r.city,
      product: r.product,
      date_add: formatUnixDate(r.date_add_raw),
      date_update: formatUnixDate(r.date_update_raw),
    })),
  );

  console.log("\nFailed / Returned rows:");
  console.table(
    stats.failedRows.map((r) => ({
      code: r.code,
      status: r.status,
      price: r.price,
      city: r.city,
      product: r.product,
      date_add: formatUnixDate(r.date_add_raw),
      date_update: formatUnixDate(r.date_update_raw),
    })),
  );
}

main().catch((err) => {
  console.error("❌ Script error:", err);
  process.exit(1);
});
