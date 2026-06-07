import supabase from "../supabase.js";

/**
 * Get ads cost grouped per product
 */
export async function getAdsCostPerProduct() {
  const { data, error } = await supabase
    .from("ads_spend")
    .select("product_name, spend");

  if (error) throw error;

  const map = {};

  for (const row of data) {
    const key = row.product_name || "unknown";

    if (!map[key]) {
      map[key] = 0;
    }

    map[key] += Number(row.spend || 0);
  }

  return map;
}
