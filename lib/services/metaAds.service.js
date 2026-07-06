function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function getActionValue(actions = [], names = []) {
  if (!Array.isArray(actions)) return 0;

  const found = actions.find((a) =>
    names.includes(String(a.action_type || "").toLowerCase()),
  );

  return n(found?.value);
}

async function fetchAllMetaPages(firstUrl) {
  let nextUrl = firstUrl;
  const allRows = [];

  while (nextUrl) {
    const response = await fetch(nextUrl);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error?.message || "Meta Ads request failed");
    }

    allRows.push(...(body.data || []));
    nextUrl = body.paging?.next || null;
  }

  return allRows;
}

export async function fetchMetaAdsInsights(options = {}) {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const accountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const apiVersion = process.env.FACEBOOK_API_VERSION || "v20.0";

  const datePreset = options.date_preset || "this_month";
  const from = options.from;
  const to = options.to;
  const level = options.level || "campaign";

  if (!token || !accountId) {
    console.warn("Meta Ads sync skipped: credentials missing");
    return [];
  }

  const cleanAccountId = accountId.replace("act_", "");

  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/act_${cleanAccountId}/insights`,
  );

  url.searchParams.set(
    "fields",
    [
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "spend",
      "impressions",
      "clicks",
      "reach",
      "cpc",
      "ctr",
      "actions",
      "cost_per_action_type",
      "date_start",
      "date_stop",
    ].join(","),
  );

  url.searchParams.set("level", level);
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("limit", "5000");

  if (from && to) {
    url.searchParams.set(
      "time_range",
      JSON.stringify({
        since: from,
        until: to,
      }),
    );
  } else {
    url.searchParams.set("date_preset", datePreset);
  }

  url.searchParams.set("access_token", token);

  const rows = await fetchAllMetaPages(url.toString());

  const totalUsd = rows.reduce((sum, row) => sum + n(row.spend), 0);
  console.log("META ADS FETCH:", {
    from,
    to,
    level,
    rows: rows.length,
    totalUsd,
  });

  return rows.map((row) => {
    const purchases = getActionValue(row.actions, [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
    ]);

    const costPerPurchaseUsd =
      getActionValue(row.cost_per_action_type, [
        "purchase",
        "omni_purchase",
        "offsite_conversion.fb_pixel_purchase",
      ]) || (purchases > 0 ? n(row.spend) / purchases : 0);

    return {
      campaign_id: row.campaign_id || null,
      campaign_name: row.campaign_name || null,

      adset_id: row.adset_id || null,
      adset_name: row.adset_name || null,

      ad_id: row.ad_id || row.campaign_id || null,
      ad_name: row.ad_name || row.campaign_name || null,

      spend_usd: n(row.spend),
      purchases,
      cost_per_purchase_usd: costPerPurchaseUsd,

      impressions: n(row.impressions),
      clicks: n(row.clicks),
      reach: n(row.reach),
      cpc_usd: n(row.cpc),
      ctr: n(row.ctr),

      date_start: row.date_start,
      date_stop: row.date_stop,
    };
  });
}
