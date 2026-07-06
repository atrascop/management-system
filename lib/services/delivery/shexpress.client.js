const BASE_URL = "https://shexpress.ma";

function getCredentials() {
  const token = process.env.SHEXPRESS_TOKEN;
  const secretKey = process.env.SHEXPRESS_SECRET_KEY;

  if (!token || !secretKey) {
    throw new Error("Missing SHEXPRESS_TOKEN or SHEXPRESS_SECRET_KEY");
  }

  return { token, secretKey };
}

function isDeliveredState(state = "") {
  const s = String(state || "")
    .trim()
    .toLowerCase();
  return ["livré", "livrée", "livre", "livree", "delivered"].includes(s);
}

function dateToUnixRange(dateString) {
  const start = new Date(`${dateString}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startTs: Math.floor(start.getTime() / 1000),
    endTs: Math.floor(end.getTime() / 1000),
  };
}

export async function listShipments() {
  const { token, secretKey } = getCredentials();

  const url = new URL(`${BASE_URL}/colislist.php`);
  url.searchParams.set("tk", token);
  url.searchParams.set("sk", secretKey);

  const response = await fetch(url);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("❌ SHExpress returned non-JSON:");
    console.error(text.slice(0, 500));

    throw new Error(
      "SHExpress returned HTML instead of JSON. Check SHEXPRESS_TOKEN / SHEXPRESS_SECRET_KEY.",
    );
  }

  if (!response.ok) {
    throw new Error("SHExpress list failed");
  }

  return Array.isArray(data) ? data : [];
}

export async function listShipmentsByDateRange(fromDate, toDate) {
  const colis = await listShipments();

  const fromRange = dateToUnixRange(fromDate);
  const toRange = dateToUnixRange(toDate || fromDate);

  const startTs = fromRange.startTs;
  const endTs = toRange.endTs;

  return colis.filter((c) => {
    const ts = Number(c.DateUpdate || c.DateAdd);
    return ts >= startTs && ts < endTs;
  });
}

export async function listShipmentsFromDate(fromDate) {
  const colis = await listShipments();

  const fromRange = dateToUnixRange(fromDate);
  const startTs = fromRange.startTs;

  return colis.filter((c) => {
    const ts = Number(c.DateUpdate || c.DateAdd);
    return ts >= startTs;
  });
}

export async function listTodayShipments() {
  const today = new Date().toISOString().slice(0, 10);
  return listShipmentsByDateRange(today, today);
}

export async function listDeliveredShipmentsByDateRange(fromDate, toDate) {
  const rows = await listShipmentsByDateRange(fromDate, toDate);

  return rows
    .filter((c) => isDeliveredState(c.State))
    .map((c) => ({
      code: c.Code,
      customer_name: c.Fullname,
      phone: c.Phone,
      city: c.City,
      address: c.Address,
      product_name: c.Product || c.Produit || c.product || "",
      price: Number(c.Price || 0),
      quantity: Number(c.Qty || 1),
      status: c.State,
      date_add: c.DateAdd,
      date_update: c.DateUpdate,
      raw: c,
    }));
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
  url.searchParams.set("city", payload.city || payload.ville || "");
  url.searchParams.set(
    "address",
    payload.address || payload.adresse || payload.address2 || "",
  );
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
