import supabase from "../supabase.js";

export async function getReturns(req, res) {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from("return_receipts")
    .select("*", { count: "exact" })
    .order("created_at_shexpress", { ascending: false })
    .range(from, to);

  if (error) {
    return res.status(500).json(error);
  }

  res.json({
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
}
