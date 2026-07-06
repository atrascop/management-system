import supabase from "../supabase.js";

function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function toDbProduct(product) {
  const payload = {
    shopify_product_id:
      product.shopify_product_id || product.shopifyProductId || null,

    title: product.name || product.title,

    sku: product.sku || null,

    price: n(product.sellingPrice ?? product.selling_price ?? product.price),

    product_type: product.category || product.product_type || null,
  };

  // client manually controls cost
  if (product.cost !== undefined) {
    payload.cost = n(product.cost);
  }

  // client manually controls stock
  if (product.stock !== undefined || product.inventory_quantity !== undefined) {
    payload.inventory_quantity = n(product.stock ?? product.inventory_quantity);
  }

  // only SHEX sync should control this
  if (
    product.shexpress_stock !== undefined ||
    product.shexpressStock !== undefined
  ) {
    payload.shexpress_stock = n(
      product.shexpress_stock ?? product.shexpressStock,
    );
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
    if (payload[key] === null) delete payload[key];
  });

  return payload;
}

async function runWithExistingProductColumns(payload, operation) {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await operation(currentPayload);

    if (!error) return data;

    const missingColumn = error.message?.match(/'([^']+)' column/)?.[1];

    if (!missingColumn || !(missingColumn in currentPayload)) {
      throw error;
    }

    delete currentPayload[missingColumn];
  }

  throw new Error("Could not save product with current products table schema");
}

function normalizeProduct(product) {
  const systemStock = n(product.inventory_quantity ?? product.stock);
  const shexpressStock = n(product.shexpress_stock);

  return {
    ...product,
    name: product.title,
    price: n(product.price),
    sellingPrice: n(product.price),
    cost: n(product.cost),
    stock: systemStock,
    inventory_quantity: systemStock,
    shexpressStock,
    shexpress_stock: shexpressStock,
    stockDifference: systemStock - shexpressStock,
  };
}

export async function getProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("title", { ascending: true });

  if (error) throw error;

  return (data || []).map(normalizeProduct);
}

export async function createProduct(product) {
  const payload = toDbProduct(product);

  return runWithExistingProductColumns(payload, (safePayload) =>
    supabase.from("products").insert(safePayload).select().single(),
  );
}

export async function updateProduct(id, product) {
  const payload = toDbProduct(product);

  return runWithExistingProductColumns(payload, (safePayload) =>
    supabase
      .from("products")
      .update({
        ...safePayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single(),
  );
}

export async function deleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function ensureProductsFromShopifyOrder(shopifyOrder) {
  const items = shopifyOrder.line_items || [];
  const created = [];
  const updated = [];
  const skipped = [];

  for (const item of items) {
    const title = item.title || item.name;
    if (!title) continue;

    const shopifyProductId = item.product_id?.toString() || null;
    const price = n(item.price ?? item.price_set?.shop_money?.amount);

    const { data: existing, error: findError } = await supabase
      .from("products")
      .select("*")
      .or(
        [
          `title.eq.${title}`,
          shopifyProductId ? `shopify_product_id.eq.${shopifyProductId}` : null,
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const payload = {
        shopify_product_id: existing.shopify_product_id || shopifyProductId,
        title,
        sku: item.sku || existing.sku || null,
        price,
        updated_at: new Date().toISOString(),
      };

      const data = await runWithExistingProductColumns(payload, (safePayload) =>
        supabase
          .from("products")
          .update(safePayload)
          .eq("id", existing.id)
          .select()
          .single(),
      );

      updated.push(data);
      continue;
    }

    const product = await createProduct({
      shopify_product_id: shopifyProductId,
      title,
      sku: item.sku || null,
      price,
      stock: 0,
      cost: 0,
      shexpress_stock: 0,
      product_type: item.product_type || null,
    });

    created.push(product);
  }

  return { created, updated, skipped };
}

export async function decrementProductStockForOrder(order) {
  const quantity = n(order.quantity || 1);
  if (!quantity || quantity <= 0) return null;

  const shopifyProductId = order.shopify_product_id?.toString();

  let query = supabase.from("products").select("*").limit(1);

  if (shopifyProductId) {
    query = query.eq("shopify_product_id", shopifyProductId);
  } else if (order.product_name) {
    query = query.eq("title", order.product_name);
  } else {
    return null;
  }

  const { data: products, error: findError } = await query;
  if (findError) throw findError;

  const product = products?.[0];
  if (!product) return null;

  const nextStock = Math.max(
    0,
    n(product.inventory_quantity ?? product.stock) - quantity,
  );

  const { data, error } = await supabase
    .from("products")
    .update({ inventory_quantity: nextStock })
    .eq("id", product.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function backfillProductsFromOrders() {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("product_name, product_price, shopify_product_id");

  if (ordersError) throw ordersError;

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("title, shopify_product_id");

  if (productsError) throw productsError;

  const existingTitles = new Set((products || []).map((p) => p.title));
  const existingShopifyIds = new Set(
    (products || [])
      .map((p) => p.shopify_product_id)
      .filter(Boolean)
      .map(String),
  );

  const queuedTitles = new Set();
  const queuedShopifyIds = new Set();
  const created = [];
  const skipped = [];

  for (const order of orders || []) {
    const title = order.product_name;
    if (!title) continue;

    const shopifyProductId = order.shopify_product_id?.toString() || null;

    if (
      existingTitles.has(title) ||
      queuedTitles.has(title) ||
      (shopifyProductId &&
        (existingShopifyIds.has(shopifyProductId) ||
          queuedShopifyIds.has(shopifyProductId)))
    ) {
      skipped.push(title);
      continue;
    }

    const product = await createProduct({
      shopify_product_id: shopifyProductId,
      title,
      price: n(order.product_price),
      stock: 0,
      cost: 0,
      shexpress_stock: 0,
    });

    queuedTitles.add(title);
    if (shopifyProductId) queuedShopifyIds.add(shopifyProductId);
    created.push(product);
  }

  return { created, skipped };
}

export async function addProductStock(id, quantity) {
  const { data: product, error: findError } = await supabase
    .from("products")
    .select("inventory_quantity")
    .eq("id", id)
    .single();

  if (findError) throw findError;

  const oldStock = Number(product.inventory_quantity || 0);

  const newStock = oldStock + Number(quantity);

  const { data, error } = await supabase
    .from("products")
    .update({
      inventory_quantity: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // save history
  await supabase.from("stock_movements").insert({
    product_id: id,
    type: "ADD",
    quantity,
    before_stock: oldStock,
    after_stock: newStock,
    note: "Manual stock addition",
  });

  return data;
}
export async function adjustProductStockForOrder(order, type) {
  const trackingNumber = order.tracking_number || order.code || null;

  if (trackingNumber) {
    const { data: existing } = await supabase
      .from("stock_movements")
      .select("id")
      .eq("tracking_number", trackingNumber)
      .eq("type", type)
      .maybeSingle();

    if (existing) {
      return null;
    }
  }

  const quantity = Number(order.quantity || 1);
  if (!quantity || quantity <= 0) return null;

  const isReturn = type === "RETURN";
  const movementQty = isReturn ? quantity : -quantity;

  let query = supabase.from("products").select("*").limit(1);

  if (order.shopify_product_id) {
    query = query.eq("shopify_product_id", String(order.shopify_product_id));
  } else if (order.product_name) {
    query = query.eq("title", order.product_name);
  } else {
    return null;
  }

  const { data: products, error: findError } = await query;
  if (findError) throw findError;

  const product = products?.[0];
  if (!product) return null;

  const oldStock = Number(product.inventory_quantity || 0);
  const newStock = Math.max(0, oldStock + movementQty);

  const { data, error } = await supabase
    .from("products")
    .update({
      inventory_quantity: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", product.id)
    .select()
    .single();

  if (error) throw error;

  await supabase.from("stock_movements").insert({
    product_id: product.id,
    type,
    quantity: movementQty,
    before_stock: oldStock,
    after_stock: newStock,
    tracking_number: trackingNumber,
    note:
      type === "DELIVERED"
        ? `Delivered order ${order.tracking_number || order.id || ""}`
        : `Returned order ${order.tracking_number || order.id || ""}`,
  });

  return data;
}
