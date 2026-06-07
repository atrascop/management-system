import supabase from "../supabase.js";

export async function getProducts() {
  const { data, error } = await supabase.from("products").select("*");

  if (error) throw error;

  return data;
}
