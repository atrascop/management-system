import dotenv from "dotenv";
import supabase from "../lib/supabase.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");

function clean(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const SHEXPRESS_STOCK = [
  {
    title: "Lumières d'ambiance Premium RGB pour Voiture",
    shexpress_stock: -1,
  },
  {
    title: ")(4 Siège) Coussin de siège auto élégante et pratique",
    shexpress_stock: 43,
  },
  {
    title:
      "Protecteur de pare-brise - Fraîcheur & Protection Pour Votre Voiture",
    shexpress_stock: 88,
  },
  {
    title:
      "Organiseur multifonction arrière – Porte-gobelet, mouchoirs et téléphone",
    shexpress_stock: 10,
  },
  {
    title:
      "Ensemble élégant et confortable de 2 pièces pour protéger le cou et le dos",
    shexpress_stock: 12,
  },
  {
    title: "Lumières “Ailes d’Ange” moto – Sécurité & style nocturne",
    shexpress_stock: 0,
  },
  {
    title: "Protège-Seuils de Porte Premium – Gardez Votre Voiture Comme Neuve",
    shexpress_stock: 2,
  },
  {
    title: "PRODUITS / 2Pcs Organisateur de Siège Anti-Chute",
    shexpress_stock: 12,
  },
  {
    title: "4pcs Protecteurs d’Ailes Voiture Anti-Rayures – Fit Universel",
    shexpress_stock: 19,
  },
  {
    title:
      "Outil de réparation des chocs et dommages de voiture en quelques minutes",
    shexpress_stock: 13,
  },
  {
    title: "Pulvérisateur Moussant Rapide et Efficace",
    shexpress_stock: -2,
  },
];

async function main() {
  const { data: products, error } = await supabase
    .from("products")
    .select("id,title,inventory_quantity,shexpress_stock");

  if (error) throw error;

  const updates = [];

  for (const stockRow of SHEXPRESS_STOCK) {
    const stockName = clean(stockRow.title);

    const product = products.find((p) => {
      const productName = clean(p.title);

      return (
        productName === stockName ||
        productName.includes(stockName) ||
        stockName.includes(productName)
      );
    });

    if (!product) {
      console.log("❌ Not matched:", stockRow.title);
      continue;
    }

    const systemStock = Number(product.inventory_quantity || 0);
    const shexpressStock = Number(stockRow.shexpress_stock || 0);

    updates.push({
      id: product.id,
      title: product.title,
      systemStock,
      shexpressStock,
      difference: systemStock - shexpressStock,
    });

    console.log("✅ Match:", product.title);
    console.log("   System:", systemStock);
    console.log("   SHExpress:", shexpressStock);
    console.log("   Diff:", systemStock - shexpressStock);

    if (APPLY) {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          shexpress_stock: shexpressStock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      if (updateError) throw updateError;
    }
  }

  console.log("\nSummary:", updates.length, "matched");
  console.log(APPLY ? "✅ Applied" : "Preview only. Run with --apply");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
