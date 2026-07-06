import dotenv from "dotenv";
import supabase from "../lib/supabase.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");

function cleanTitle(title) {
  return String(title || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function bestValue(primary, duplicate, field) {
  return primary[field] ?? duplicate[field] ?? null;
}

async function main() {
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const groups = new Map();

  for (const product of products || []) {
    const key = cleanTitle(product.title);
    if (!key) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }

  const duplicates = [...groups.values()].filter((group) => group.length > 1);

  console.log(`Found duplicate groups: ${duplicates.length}`);

  for (const group of duplicates) {
    const keeper =
      group.find(
        (p) =>
          p.shopify_product_id && String(p.shopify_product_id).trim() !== "",
      ) ||
      [...group].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      )[0];
    group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];

    const toDelete = group.filter((p) => p.id !== keeper.id);

    const merged = { ...keeper };

    for (const dup of toDelete) {
      if (!merged.cost || Number(merged.cost) === 0) {
        merged.cost = Number(dup.cost || 0);
      }

      if (
        !merged.inventory_quantity ||
        Number(merged.inventory_quantity) === 0
      ) {
        merged.inventory_quantity = Number(dup.inventory_quantity || 0);
      }

      if (!merged.shexpress_stock || Number(merged.shexpress_stock) === 0) {
        merged.shexpress_stock = Number(dup.shexpress_stock || 0);
      }

      if (!merged.price || Number(merged.price) === 0) {
        merged.price = Number(dup.price || 0);
      }

      if (!merged.shopify_product_id && dup.shopify_product_id) {
        merged.shopify_product_id = dup.shopify_product_id;
      }
    }

    console.log("\nPRODUCT:", keeper.title);
    console.log("KEEP:", keeper.id, "shopify:", keeper.shopify_product_id);
    console.log(
      "DELETE:",
      toDelete.map((p) => p.id),
    );

    if (!APPLY) continue;

    const { error: updateError } = await supabase
      .from("products")
      .update({
        shopify_product_id: merged.shopify_product_id,
        price: merged.price,
        cost: merged.cost,
        inventory_quantity: merged.inventory_quantity,
        shexpress_stock: merged.shexpress_stock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", keeper.id);

    if (updateError) throw updateError;

    for (const dup of toDelete) {
      const { error: deleteError } = await supabase
        .from("products")
        .delete()
        .eq("id", dup.id);

      if (deleteError) throw deleteError;
    }
  }

  console.log(
    APPLY
      ? "\n✅ Cleanup applied"
      : "\nPreview only. Run with --apply to delete duplicates.",
  );
}

main().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
