import supabase from "../supabase.js";
import { fetchMetaAdsInsights } from "./metaAds.service.js";

const USD_TO_MAD = Number(process.env.USD_TO_MAD || 1);

function n(value) {
  const x = Number(value || 0);
  return Number.isFinite(x) ? x : 0;
}

function toStoreCurrency(value) {
  return n(value) * USD_TO_MAD;
}

function toDay(value) {
  if (!value) return "";

  const text = String(value).trim();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);

  if (match) return match[0];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDatesBetween(from, to) {
  const start = toDay(from);
  const end = toDay(to || from);

  if (!start || !end) return [];

  const dates = [];
  let current = start;

  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function adUniqueKey(ad) {
  return [
    ad.ad_id || ad.campaign_id || "",
    ad.date || ad.date_start || "",
  ].join("|");
}

function isDailyRow(ad) {
  const start = toDay(ad.date_start || ad.date);
  const stop = toDay(ad.date_stop || ad.date);

  // Old bad rows from range sync look like:
  // date_start = 2026-06-28, date_stop = 2026-07-04
  // We ignore them in reads.
  if (start && stop && start !== stop) return false;

  return true;
}

function dedupeAds(rows = []) {
  const map = new Map();

  for (const ad of rows || []) {
    if (!isDailyRow(ad)) continue;

    const key = adUniqueKey(ad);
    if (!key.trim()) continue;

    const existing = map.get(key);

    if (!existing) {
      map.set(key, ad);
      continue;
    }

    const oldCreated = new Date(existing.created_at || 0).getTime();
    const newCreated = new Date(ad.created_at || 0).getTime();

    if (newCreated >= oldCreated) {
      map.set(key, ad);
    }
  }

  return Array.from(map.values());
}

function buildAdsPayload(rows = []) {
  const map = new Map();

  for (const row of rows || []) {
    if (!row.ad_id && !row.campaign_id) continue;

    const date = toDay(row.date || row.date_start || new Date());

    if (!date) continue;

    const spend = n(row.spend_usd ?? row.spend);
    const cpc = n(row.cpc_usd ?? row.cpc);
    const costPerPurchase = n(
      row.cost_per_purchase_usd ?? row.cost_per_purchase,
    );

    const payload = {
      campaign_id: row.campaign_id || null,
      campaign_name: row.campaign_name || null,

      adset_id: row.adset_id || null,
      adset_name: row.adset_name || null,

      // Because we sync at campaign level, ad_id can safely fallback to campaign_id
      ad_id: row.ad_id || row.campaign_id,
      ad_name: row.ad_name || row.campaign_name,

      spend: toStoreCurrency(spend),
      cpc: toStoreCurrency(cpc),
      cost_per_purchase: toStoreCurrency(costPerPurchase),
      purchases: n(row.purchases),

      impressions: n(row.impressions),
      clicks: n(row.clicks),
      reach: n(row.reach),
      ctr: n(row.ctr),

      date,
      date_start: date,
      date_stop: date,
    };

    map.set(adUniqueKey(payload), payload);
  }

  return Array.from(map.values());
}

export async function getAdsSpend(filters = {}) {
  let query = supabase
    .from("ads_spend")
    .select("*")
    .order("date", { ascending: false });

  if (filters.from) query = query.gte("date", toDay(filters.from));
  if (filters.to) query = query.lte("date", toDay(filters.to));

  const { data, error } = await query;

  if (error) throw error;

  return dedupeAds(data || []);
}

export async function saveAdsInsights(rows = [], options = {}) {
  const payload = buildAdsPayload(rows);

  if (!payload.length) {
    return {
      saved: 0,
    };
  }

  const dates = payload
    .map((p) => p.date)
    .filter(Boolean)
    .sort();

  const from = toDay(options.from || dates[0]);
  const to = toDay(options.to || dates.at(-1));

  // Important:
  // Clean the exact range before saving.
  // This removes old bad range rows and duplicate sync rows.
  if (from && to) {
    const { error: deleteError } = await supabase
      .from("ads_spend")
      .delete()
      .gte("date", from)
      .lte("date", to);

    if (deleteError) throw deleteError;
  }

  const { error } = await supabase.from("ads_spend").insert(payload);

  if (error) throw error;

  return {
    saved: payload.length,
  };
}

export async function createAd(row) {
  const date = toDay(row.date || new Date());

  const payload = {
    campaign_id: row.campaign_id || null,
    campaign_name: row.campaign_name || null,

    adset_id: row.adset_id || null,
    adset_name: row.adset_name || null,

    ad_id: row.ad_id || row.campaign_id || `manual-${Date.now()}`,
    ad_name: row.ad_name || row.campaign_name || "Manual Ad",

    spend: n(row.spend),
    cpc: n(row.cpc),
    cost_per_purchase: n(row.cost_per_purchase),
    purchases: n(row.purchases),

    impressions: n(row.impressions),
    clicks: n(row.clicks),
    reach: n(row.reach),
    ctr: n(row.ctr),

    date,
    date_start: date,
    date_stop: date,
  };

  const { data, error } = await supabase
    .from("ads_spend")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function deleteAd(id) {
  const { error } = await supabase.from("ads_spend").delete().eq("id", id);

  if (error) throw error;
}

export async function clearAdsByDate(date) {
  const day = toDay(date);

  const { error } = await supabase.from("ads_spend").delete().eq("date", day);

  if (error) throw error;
}

export async function getCampaignAdsSummary(filters = {}) {
  return getAdsSpend(filters);
}

export async function syncMetaAdsForRange(filters = {}) {
  const today = new Date().toISOString().slice(0, 10);

  const from = toDay(filters.from || today);
  const to = toDay(filters.to || from);

  const dates = getDatesBetween(from, to);

  const allInsights = [];

  for (const date of dates) {
    const dailyInsights = await fetchMetaAdsInsights({
      from: date,
      to: date,
      level: "campaign",
    });

    for (const row of dailyInsights || []) {
      allInsights.push({
        ...row,
        date,
        date_start: date,
        date_stop: date,
      });
    }
  }

  const totalSpend = allInsights.reduce(
    (sum, row) => sum + n(row.spend_usd ?? row.spend),
    0,
  );

  console.log("✅ META SYNC RANGE DAILY:", {
    from,
    to,
    days: dates.length,
    rows: allInsights.length,
    totalRawSpend: totalSpend,
    totalStoreCurrency: totalSpend * USD_TO_MAD,
  });

  const byDate = {};

  for (const row of allInsights) {
    const date = toDay(row.date_start || row.date);
    byDate[date] = (byDate[date] || 0) + n(row.spend_usd ?? row.spend);
  }

  console.log("✅ META SYNC BY DATE:", byDate);

  const result = await saveAdsInsights(allInsights, {
    from,
    to,
  });

  return {
    synced: result.saved,
    from,
    to,
    days: dates.length,
    totalRawSpend: totalSpend,
    totalStoreCurrency: totalSpend * USD_TO_MAD,
  };
}
