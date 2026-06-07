// lib/services/metaAds.service.js

export async function fetchMetaAdsInsights() {
  try {
    console.log("📢 Meta Ads sync requested");

    // TEMPORARY MOCK DATA
    const insights = [
      {
        campaign_id: "mock_campaign_1",
        campaign_name: "LED Campaign",
        spend: 250,
        impressions: 5000,
        clicks: 120,
        reach: 4200,
      },
    ];

    console.log("META RESPONSE RAW:");
    console.dir(insights, { depth: null });

    return insights;
  } catch (err) {
    console.error("❌ Meta Ads error:", err);
    return [];
  }
}
