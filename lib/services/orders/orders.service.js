import * as deliveryService from "../delivery/delivery.service.js";
import supabase from "../../supabase.js";

/**
 * MARK ORDER AS RETURNED + CREATE SHEXPRESS RETURN
 */
export async function markOrderReturned(orderId) {
  // 1. fetch order
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError) throw fetchError;

  // 2. update order status → returned
  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "returned" })
    .eq("id", orderId);

  if (updateError) throw updateError;

  // 3. create return in SHExpress system
  const returnData = await deliveryService.createReturn(order);

  // 4. save return code back to order
  const { error: returnUpdateError } = await supabase
    .from("orders")
    .update({
      return_code: returnData.returnCode,
    })
    .eq("id", orderId);

  if (returnUpdateError) throw returnUpdateError;

  // 5. response
  return {
    success: true,
    orderId,
    return: returnData,
  };
}
