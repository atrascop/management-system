import supabase from "../../supabase.js";

export async function saveShipment(shipment) {
  const { data, error } = await supabase
    .from("shipments")
    .insert([shipment])
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getShipmentByTracking(trackingNumber) {
  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .eq("tracking_number", trackingNumber)
    .maybeSingle(); // ✅ IMPORTANT FIX

  if (error) throw error;

  return data; // can be null safely
}

export async function getShipmentsByOrder(orderId) {
  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .eq("order_id", orderId);

  if (error) throw error;
  return data;
}
