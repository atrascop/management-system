import supabase from "../supabase.js";

function clean(v) {
  return String(v || "").toLowerCase();
}

function scoreMatch(product, ad) {
  const p = clean(product.title);
  const text = clean(
    `${ad.campaign_name || ""} ${ad.adset_name || ""} ${ad.ad_name || ""}`,
  );

  let score = 0;

  for (const word of p.split(/\s+/)) {
    if (word.length > 3 && text.includes(word)) score += 1;
  }

  return score;
}

export async function autoMatchCampaignsToProducts() {
  const { data: products, error: pError } = await supabase
    .from("products")
    .select("title");

  if (pError) throw pError;

  const { data: ads, error: aError } = await supabase
    .from("ads_spend")
    .select("campaign_name,adset_name,ad_name");

  if (aError) throw aError;

  const mappings = [];

  for (const ad of ads || []) {
    let bestProduct = null;
    let bestScore = 0;

    for (const product of products || []) {
      const score = scoreMatch(product, ad);

      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    }

    if (bestProduct && bestScore >= 2) {
      mappings.push({
        product_name: bestProduct.title,
        campaign_name: ad.campaign_name,
        adset_name: ad.adset_name,
        ad_name: ad.ad_name,
        confidence: bestScore,
      });
    }
  }

  if (mappings.length > 0) {
    await supabase.from("product_campaign_mappings").upsert(mappings, {
      onConflict: "campaign_name,adset_name,ad_name",
    });
  }

  return {
    matched: mappings.length,
    mappings,
  };
}
