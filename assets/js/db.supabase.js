// assets/js/db.supabase.js
import { supabase } from "./config.supabase.js";

// --- Deliveries ---
export async function listDeliveries() {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .order("accepted_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertDelivery(row) {
  // row can include id (uuid) to update; else insert
  const { data, error } = await supabase
    .from("deliveries")
    .upsert(row, { onConflict: "id" })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteDelivery(id) {
  const { error } = await supabase.from("deliveries").delete().eq("id", id);
  if (error) throw error;
}

// --- Earnings ---
export async function saveEarnings(payload) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("earnings")
    .upsert(
      {
        user_id: user?.id,
        grubhub_json: payload.grubhub || {},
        ubereats_json: payload.uberEats || {},
        grand_total: payload.grandTotal || "0.00",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEarnings() {
  const { data, error } = await supabase
    .from("earnings")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
