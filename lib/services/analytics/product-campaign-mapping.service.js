import supabase from "../../supabase.js";

export async function getProductCampaignMappings() {
  const { data, error } = await supabase
    .from("product_campaign_mappings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function createProductCampaignMapping(payload) {
  const { data, error } = await supabase
    .from("product_campaign_mappings")
    .insert({
      product_id: payload.product_id || null,

      shopify_product_id: payload.shopify_product_id
        ? String(payload.shopify_product_id)
        : null,

      product_name: payload.product_name || null,

      // IMPORTANT META IDS
      campaign_id: payload.campaign_id ? String(payload.campaign_id) : null,

      adset_id: payload.adset_id ? String(payload.adset_id) : null,

      ad_id: payload.ad_id ? String(payload.ad_id) : null,

      // backup names
      campaign_name: payload.campaign_name || null,
      adset_name: payload.adset_name || null,
      ad_name: payload.ad_name || null,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
