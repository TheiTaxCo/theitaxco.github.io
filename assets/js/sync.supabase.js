// assets/js/sync.supabase.js
import {
  listDeliveries,
  upsertDelivery,
  listPlatforms,
  // Ensure a shift exists so deliveries.shift_id (NOT NULL) is satisfied
  getOpenShiftId,
  startShift,
  updateShiftById,
  // Insert per-platform earnings rows (optional)
  insertPlatformEarnings,
} from "./db.supabase.js";
import { supabase } from "./config.supabase.js";
import {
  mapMealToDeliveryRow,
  mapDeliveryRowToLocal,
  mapLocalToPlatformEarningsRows, // if using per-platform earnings
} from "./formatters.supabase.js";

// Convert a local date-string (from toLocaleString) to ISO, or null if invalid
function toISOOrNull(localStr) {
  if (!localStr || !String(localStr).trim()) return null;
  const d = new Date(localStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
// Safe numeric (returns null if empty/NaN)
function toNumOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildPlatformMaps(rows) {
  // rows: [{platform_id, platform_code}]
  const byCode = new Map(); // code(lowercased) -> platform_id
  const byId = new Map(); // platform_id -> code
  for (const r of rows || []) {
    if (!r) continue;
    const platCode = String(r.platform_code || "").toLowerCase();
    byCode.set(platCode, r.platform_id);
    byId.set(r.platform_id, r.platform_code);
  }
  return { byCode, byId };
}

function toast(msg) {
  const el = document.getElementById("customToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show-toast");
  setTimeout(() => el.classList.remove("show-toast"), 3000);
}

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export async function pushLocalToCloud() {
  const userId = await getCurrentUserId();

  // 0) Read the Home values your script.js saved into localStorage
  const state = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
  const startISO = toISOOrNull(state?.startTime);
  const endISO = toISOOrNull(state?.endTime);
  const odoStart = toNumOrNull(state?.odometerStart);
  const odoEnd = toNumOrNull(state?.odometerEnd);

  // Compute duration & miles (client-side so columns fill even without DB trigger)
  const durationMinutes =
    startISO && endISO
      ? Math.ceil((new Date(endISO) - new Date(startISO)) / 60000)
      : null;
  const miles =
    odoStart !== null && odoEnd !== null && odoEnd >= odoStart
      ? Number((odoEnd - odoStart).toFixed(1))
      : null;

  // 1) Ensure a shift exists; seed start/shift_date/odometer_start at create time
  let shiftId = await getOpenShiftId(userId);
  if (!shiftId) {
    const init = {};
    if (startISO) {
      init.start_at = startISO;
      init.shift_date = startISO.slice(0, 10); // YYYY-MM-DD
    }
    if (odoStart !== null) init.odometer_start = odoStart;
    shiftId = await startShift(userId, init);
  }

  // 2) Update that SAME shift by id with end/odometers/duration/miles
  const patch = {};
  if (startISO) {
    patch.start_at = startISO;
    patch.shift_date = startISO.slice(0, 10);
  }
  if (odoStart !== null) patch.odometer_start = odoStart;
  if (odoEnd !== null) patch.odometer_end = odoEnd;
  if (endISO) patch.end_at = endISO;

  if (Object.keys(patch).length) {
    await updateShiftById(shiftId, patch);
  }

  // 3) Platforms → maps
  const platforms = await listPlatforms();
  const { byCode } = buildPlatformMaps(platforms);

  // 4) Deliveries → include user_id + shift_id
  const meals = Array.isArray(state.meals) ? state.meals : [];
  for (const m of meals) {
    const row = {
      ...mapMealToDeliveryRow(m, byCode),
      user_id: userId,
      shift_id: shiftId,
    };
    await upsertDelivery(row);
  }

  // 5) Earnings (optional; per-platform rows)
  const es = JSON.parse(localStorage.getItem("earningsSummary") || "{}");
  if (Object.keys(es).length && typeof insertPlatformEarnings === "function") {
    const rows =
      mapLocalToPlatformEarningsRows?.(es, userId, shiftId, byCode) || [];
    if (rows.length) await insertPlatformEarnings(rows);
  }
}

export async function pullCloudToLocal() {
  // Load platforms once for reverse mapping
  const platforms = await listPlatforms();
  const { byId } = buildPlatformMaps(platforms);

  // Deliveries
  const rows = await listDeliveries();
  const meals = rows.map((r) => mapDeliveryRowToLocal(r, byId));

  // Merge into existing local state shape your UI expects
  const prev = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
  localStorage.setItem("deliveryAppState", JSON.stringify({ ...prev, meals }));

  // Earnings pull is intentionally skipped because 'earnings' is per-platform rows.
  // If you want, we can add an aggregator to rebuild earningsSummary locally.
}

// Auto-wire the Transmit button on pages that include this module
window.addEventListener("DOMContentLoaded", () => {
  const tx = document.getElementById("transmitSupabaseBtn");
  if (tx) {
    tx.addEventListener("click", async () => {
      try {
        await pushLocalToCloud();
        toast("Data transmitted to Supabase!");
      } catch (err) {
        const msg = err?.message || "unknown";
        toast(
          msg.includes("Not signed in")
            ? "Please sign in before transmitting."
            : "Transmission error: " + msg
        );
      }
    });
  }
});
