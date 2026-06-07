import supabase from "../supabase.js";

/**
 * GET ADS SPEND (for dashboards)
 */
export async function getAdsSpend() {
  const { data, error } = await supabase
    .from("ads_spend")
    .select("*")
    .order("date", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * SAVE META ADS INSIGHTS (RAW CAMPAIGNS)
 * No product mapping here (KEEP SEPARATION CLEAN)
 */
export async function saveAdsInsights(rows) {
  if (!rows?.length) return;

  const payload = rows
    .filter((row) => row.campaign_id || row.id) // prevent empty rows
    .map((row) => ({
      campaign_id: row.campaign_id || row.id,
      campaign_name: row.campaign_name || row.name,
      spend: Number(row.spend || 0),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      reach: Number(row.reach || 0),
      date: new Date().toISOString().slice(0, 10),
    }));

  const { error } = await supabase.from("ads_spend").upsert(payload, {
    onConflict: "campaign_id,date",
  });

  if (error) throw error;
}

/**
 * CREATE SINGLE RECORD (manual/debug use only)
 */
export async function createAd(row) {
  const payload = {
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    product_id: row.product_id || null,
    product_name: row.product_name || null,
    spend: Number(row.spend || 0),
    date: row.date || new Date().toISOString().slice(0, 10),
  };

  const { data, error } = await supabase
    .from("ads_spend")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * DELETE AD RECORD
 */
export async function deleteAd(id) {
  const { error } = await supabase.from("ads_spend").delete().eq("id", id);

  if (error) throw error;
}

/**
 * OPTIONAL: CLEAR OLD DATA (use carefully)
 */
export async function clearAdsByDate(date) {
  const { error } = await supabase.from("ads_spend").delete().eq("date", date);

  if (error) throw error;
}
