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
  // Normalize payload so DB always sees delivery_id
  const payload = { ...row };
  if (payload.id && !payload.delivery_id) {
    payload.delivery_id = payload.id;
    delete payload.id;
  }
  const { data, error } = await supabase
    .from("deliveries")
    .upsert(payload, { onConflict: "delivery_id" })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteDelivery(id) {
  const { error } = await supabase
    .from("deliveries")
    .delete()
    .eq("delivery_id", id);
  if (error) throw error;
}

// --- Shifts helpers ---
export async function getOpenShiftId(userId) {
  const { data, error } = await supabase
    .from("shifts")
    .select("shift_id")
    .eq("user_id", userId)
    .is("end_at", null)
    .maybeSingle();
  if (error) throw error;
  return data?.shift_id || null;
}

// Start a shift; pass any initial columns you want to set (e.g. start_at, shift_date, odometer_start, note)
export async function startShift(userId, init = {}) {
  // Spread init directly so fields land in their real columns
  const insert = { user_id: userId, ...init };
  const { data, error } = await supabase
    .from("shifts")
    .insert([insert])
    .select("shift_id")
    .single();
  if (error) throw error;
  return data.shift_id;
}

// Update a shift by its id (safe even if it's already closed)
export async function updateShiftById(shiftId, patch) {
  if (!shiftId || !patch || !Object.keys(patch).length) return null;
  const { error } = await supabase
    .from("shifts")
    .update(patch)
    .eq("shift_id", shiftId);
  if (error) throw error;
  return shiftId;
}

// End the open shift; you can pass end_at/odometer_end or let defaults fill
export async function endOpenShift(userId, patch = {}) {
  const { data: open, error: findErr } = await supabase
    .from("shifts")
    .select("shift_id")
    .eq("user_id", userId)
    .is("end_at", null)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!open) return null;

  const { error: updErr } = await supabase
    .from("shifts")
    .update({ end_at: new Date().toISOString(), ...patch })
    .eq("shift_id", open.shift_id);
  if (updErr) throw updErr;
  return open.shift_id;
}

// --- Earnings (per-platform rows) ---
export async function insertPlatformEarnings(rows) {
  if (!rows?.length) return [];
  const { data, error } = await supabase.from("earnings").insert(rows).select();
  if (error) throw error;
  return data || [];
}

// --- Platforms ---
export async function listPlatforms() {
  const { data, error } = await supabase
    .from("platforms")
    .select("platform_id, platform_code");
  if (error) throw error;
  return data || [];
}
