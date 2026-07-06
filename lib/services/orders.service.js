import supabase from "../supabase.js";
import * as deliveryService from "./delivery/delivery.service.js";
import { decrementProductStockForOrder } from "./products.service.js";

async function resolveProductPrice(orderData) {
  if (
    orderData.product_price ||
    orderData.sellingPrice ||
    orderData.selling_price ||
    orderData.price
  ) {
    return Number(
      orderData.product_price ??
        orderData.sellingPrice ??
        orderData.selling_price ??
        orderData.price ??
        0,
    );
  }

  let query = supabase.from("products").select("price").limit(1);

  if (orderData.product_id) {
    query = query.eq("id", orderData.product_id);
  } else if (orderData.shopify_product_id) {
    query = query.eq("shopify_product_id", orderData.shopify_product_id);
  } else if (orderData.product_name) {
    query = query.eq("title", orderData.product_name);
  } else {
    return 0;
  }

  const { data, error } = await query;
  if (error) throw error;

  return Number(data?.[0]?.price || 0);
}

async function normalizeOrderFinancials(orderData) {
  const quantity = Number(orderData.quantity || 1);
  const productPrice = await resolveProductPrice(orderData);
  const shopifyTotal = Number(orderData.total_price ?? orderData.total ?? 0);

  return {
    ...orderData,
    product_price: productPrice,
    quantity,
    total_price: shopifyTotal || productPrice * quantity,
    currency: (orderData.currency || "MAD").toUpperCase(),
  };
}

function normalizePositiveInt(value, fallback = 50, max = 10000) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) return fallback;

  return Math.min(Math.floor(number), max);
}

const APP_TIME_ZONE = "Africa/Casablanca";
const SUCCESSFUL_REVENUE_STATUSES = new Set([
  "confirmed",
  "shipped",
  "delivered",
]);
const EXCLUDED_REVENUE_STATUSES = new Set([
  "returned",
  "cancelled",
  "canceled",
  "rejected",
  "failed_delivery",
]);

const moroccoDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function getTimeZoneOffsetMs(date) {
  const parts = {};

  for (const part of moroccoDateFormatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }

  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function localDateTimeToUtcIso(value, hour, minute, second, millisecond) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) return null;

  const utcGuess = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  let offset = getTimeZoneOffsetMs(new Date(utcGuess));
  let utc = utcGuess - offset;

  offset = getTimeZoneOffsetMs(new Date(utc));
  utc = utcGuess - offset;

  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function startOfDayIso(value) {
  return localDateTimeToUtcIso(value, 0, 0, 0, 0);
}

function endOfDayIso(value) {
  return localDateTimeToUtcIso(value, 23, 59, 59, 999);
}

function applyOrderFilters(query, filters, fromIso, toIso) {
  let nextQuery = query;

  if (fromIso) nextQuery = nextQuery.gte("created_at", fromIso);
  if (toIso) nextQuery = nextQuery.lte("created_at", toIso);
  if (filters.status) nextQuery = nextQuery.eq("status", filters.status);

  return nextQuery;
}

function buildOrderSummary(rows, count) {
  const statusCounts = {};
  const excludedStatuses = {};

  let itemsOrdered = 0;
  let successfulRevenue = 0;

  for (const order of rows || []) {
    const status = String(
      order.status || order.financial_status || "pending",
    ).toLowerCase();
    const quantity = Number(order.quantity || 1);
    const total = Number(order.total_price ?? 0);

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    itemsOrdered += Number.isFinite(quantity) ? quantity : 0;

    if (SUCCESSFUL_REVENUE_STATUSES.has(status)) {
      successfulRevenue += Number.isFinite(total) ? total : 0;
    }

    if (EXCLUDED_REVENUE_STATUSES.has(status)) {
      excludedStatuses[status] = (excludedStatuses[status] || 0) + 1;
    }
  }

  return {
    totalOrders: count || 0,
    currentRows: rows?.length || 0,
    itemsOrdered,
    statusCounts,
    successfulRevenue,
    excludedStatuses,
  };
}

async function getOrdersSummary(filters, fromIso, toIso) {
  let query = supabase
    .from("orders")
    .select("status,financial_status,quantity,total_price", { count: "exact" });

  query = applyOrderFilters(query, filters, fromIso, toIso);

  const { data, error, count } = await query;

  if (error) throw error;

  return buildOrderSummary(data || [], count || 0);
}

/**
 * CREATE ORDER
 */
export async function createOrder(orderData) {
  const normalized = await normalizeOrderFinancials(orderData);
  const { data, error } = await supabase
    .from("orders")
    .insert(normalized)
    .select()
    .single();

  if (error) throw error;
  await decrementProductStockForOrder(data);
  return data;
}

/**
 * GET ORDERS
 * Pass filters for paginated screens. Call without filters for legacy/internal callers.
 */
export async function getOrders(filters = {}) {
  const hasFilters = Boolean(
    filters.from ||
    filters.to ||
    filters.status ||
    filters.page ||
    filters.limit,
  );
  const page = normalizePositiveInt(filters.page, 1, 100000);
  const limit = normalizePositiveInt(filters.limit, 50, 10000);
  const fromIso = startOfDayIso(filters.from);
  const toIso = endOfDayIso(filters.to);

  let query = supabase
    .from("orders")
    .select("*", hasFilters ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false });

  query = applyOrderFilters(query, filters, fromIso, toIso);

  if (hasFilters) {
    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  if (hasFilters) {
    const summary = await getOrdersSummary(filters, fromIso, toIso);

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
      summary,
    };
  }

  return data;
}

/**
 * GET SINGLE ORDER
 */
export async function getOrderById(id) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * UPDATE ORDER (generic)
 */
export async function updateOrder(id, updates) {
  const { data, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * UPDATE ONLY STATUS (simple helper)
 */
export async function updateOrderStatus(id, status) {
  return updateOrder(id, { status });
}

/**
 * CONFIRM ORDER → TRIGGERS DELIVERY AUTOMATION
 * THIS IS YOUR MAIN BUSINESS FLOW
 */
export async function confirmOrder(orderId, deliveryUpdates = {}) {
  const cleanUpdates = {};

  if (deliveryUpdates.city !== undefined)
    cleanUpdates.city = deliveryUpdates.city;
  if (deliveryUpdates.address1 !== undefined)
    cleanUpdates.address1 = deliveryUpdates.address1;
  if (deliveryUpdates.address2 !== undefined)
    cleanUpdates.address2 = deliveryUpdates.address2;
  if (deliveryUpdates.address !== undefined)
    cleanUpdates.address = deliveryUpdates.address;
  if (deliveryUpdates.note !== undefined)
    cleanUpdates.note = deliveryUpdates.note;

  if (Object.keys(cleanUpdates).length > 0) {
    await updateOrder(orderId, cleanUpdates);
  }

  const freshOrder = await getOrderById(orderId);

  if (!freshOrder) {
    throw new Error("Order not found");
  }

  const cityValue =
    deliveryUpdates.city ||
    deliveryUpdates.address1 ||
    freshOrder.address1 ||
    freshOrder.city ||
    "";

  const address2Value =
    deliveryUpdates.address2 ||
    deliveryUpdates.address ||
    freshOrder.address2 ||
    freshOrder.address ||
    "";

  const noteValue =
    deliveryUpdates.note || deliveryUpdates.remarque || freshOrder.note || "";

  await updateOrder(orderId, {
    status: "confirmed",
  });

  try {
    console.log("🚚 SHExpress payload:", {
      cityValue,
      address2Value,
      noteValue,
    });

    const shipment = await deliveryService.createShipment({
      id: freshOrder.id,
      customer_name: freshOrder.customer_name,
      phone: freshOrder.phone,

      city: cityValue,
      ville: cityValue,

      address: address2Value,
      adresse: address2Value,
      address2: address2Value,
      adresse2: address2Value,

      note: noteValue,

      product_name: freshOrder.product_name,
      total_price: freshOrder.total_price,
    });

    const updatedOrder = await updateOrder(orderId, {
      status: "shipped",
      tracking_number: shipment.tracking_number,
    });

    return {
      order: updatedOrder,
      shipment,
    };
  } catch (error) {
    await updateOrder(orderId, {
      status: "failed_delivery",
    });

    throw error;
  }
}
