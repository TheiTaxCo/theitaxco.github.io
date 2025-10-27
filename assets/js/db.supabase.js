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

// --- Weekly Earnings from earnings table (LA week, stored as UTC DATE = LA+1) ---
// Overloads:
//   sumWeeklyEarningsFromEarningsTable()                  -> week containing today (Mon–Sun, LA)
//   sumWeeklyEarningsFromEarningsTable(anchorISO)         -> week containing anchorISO (LA)
//   sumWeeklyEarningsFromEarningsTable(startISO, endISO)  -> explicit LA [Mon..Sun], end inclusive
export async function sumWeeklyEarningsFromEarningsTable(a, b) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const toDateOnly = (d) => d.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const atStartOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const atEndOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  // 1) Build LA week window (Mon 00:00 → Sun 23:59:59.999) from inputs in LA
  let laMonStart, laSunEndInclusive;
  if (a && b) {
    // Caller provided explicit LA dates (YYYY-MM-DD)
    laMonStart = atStartOfDay(new Date(`${a}T00:00:00`)); // Monday LA
    laSunEndInclusive = atEndOfDay(new Date(`${b}T00:00:00`)); // Sunday LA
  } else {
    // Anchor-based LA week (Mon..Sun)
    const anchor = a ? new Date(`${a}T00:00:00`) : new Date();
    const mon = atStartOfDay(anchor);
    const dow = mon.getDay(); // 0=Sun..6=Sat
    const deltaToMon = (dow + 6) % 7; // Mon->0, Sun->6
    mon.setDate(mon.getDate() - deltaToMon);
    laMonStart = mon;
    const sun = atEndOfDay(addDays(mon, 6));
    laSunEndInclusive = sun;
  }

  // 2) Map LA dates to stored UTC DATEs (your `earnings_date` behaves as LA+1 day)
  // Stored window: Tue (LA Mon + 1) up to next Tue exclusive
  const storedStart = addDays(laMonStart, 1); // Tue
  const storedEndExclusive = addDays(storedStart, 7); // next Tue (exclusive)

  const startISO = toDateOnly(storedStart);
  const endExclusiveISO = toDateOnly(storedEndExclusive);

  // 3) Query with inclusive lower + exclusive upper
  const { data, error } = await supabase
    .from("earnings")
    .select(
      "platform_id, earnings_date, total, delivery_pay, tips, adjustment_pay"
    )
    .eq("user_id", user.id)
    .gte("earnings_date", startISO) // include Tue start
    .lt("earnings_date", endExclusiveISO); // exclude next Tue

  if (error) throw error;

  // 4) Sum amounts per platform (prefer parts when present)
  const idToCode = { 1: "grubhub", 2: "ubereats" };
  let gh = 0,
    ue = 0;

  for (const r of data || []) {
    const hasParts =
      r.delivery_pay != null || r.tips != null || r.adjustment_pay != null;
    const delivery = parseFloat(r.delivery_pay ?? 0) || 0;
    const tips = parseFloat(r.tips ?? 0) || 0;
    const adj = parseFloat(r.adjustment_pay ?? 0) || 0;
    const amount = hasParts ? delivery + tips + adj : parseFloat(r.total) || 0;

    if (idToCode[r.platform_id] === "grubhub") gh += amount;
    else if (idToCode[r.platform_id] === "ubereats") ue += amount;
  }

  return {
    laRange: {
      start: toDateOnly(laMonStart),
      endInclusive: toDateOnly(addDays(laMonStart, 6)),
    },
    storedRange: { start: startISO, endExclusive: endExclusiveISO },
    grubhub: Number(gh.toFixed(2)),
    ubereats: Number(ue.toFixed(2)),
    grand: Number((gh + ue).toFixed(2)),
    rows: data || [],
  };
}
