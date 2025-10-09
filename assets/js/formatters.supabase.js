// assets/js/formatters.supabase.js
// Pure transforms only: localStorage → DB rows (and back). No DOM here.

function stripAcceptedPrefix(text) {
  return (text || "").replace(/^Accepted on:\s*/i, "").trim();
}

function toISOOrNull(localeish) {
  if (!localeish) return null;
  const d = new Date(localeish);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toLocaleOrEmpty(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
}

// Map assorted UI labels to your canonical platform_code values
function normalizePlatformCode(name) {
  if (!name) return null;
  const s = String(name).trim().toLowerCase();
  if (["grubhub", "gh", "grub hub"].includes(s)) return "grubHub";
  if (["ubereats", "uber eats", "ue", "uber"].includes(s)) return "uberEats";
  return null; // unknown
}

// Optional: convert canonical code back to a friendly UI label
function codeToUiLabel(code) {
  if (!code) return "";
  switch (code) {
    case "grubHub":
      return "Grubhub";
    case "uberEats":
      return "Uber Eats";
    default:
      return code;
  }
}

// Optional: randomize seconds if 00 for iOS manual entries (off by default)
const ENABLE_SECOND_RANDOMIZATION = false;
function randomizeSecondsIfZero(isoString) {
  if (!isoString) return isoString;
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  if (d.getSeconds() === 0 && ENABLE_SECOND_RANDOMIZATION) {
    const rand = Math.floor(Math.random() * 59) + 1; // 1..59
    d.setSeconds(rand);
    return d.toISOString();
  }
  return isoString;
}

export function mapMealToDeliveryRow(localMeal, platformsByCode) {
  // localMeal.timestamp looks like "Accepted on: 8/12/2025, 10:15:32 PM"
  const acceptedLocal = stripAcceptedPrefix(localMeal.timestamp);
  let acceptedISO = toISOOrNull(acceptedLocal);
  let deliveredISO = toISOOrNull(localMeal.delivered);

  // Optional seconds randomization for iOS edge case
  acceptedISO = randomizeSecondsIfZero(acceptedISO);
  deliveredISO = randomizeSecondsIfZero(deliveredISO);

  const uiCode = normalizePlatformCode(localMeal.courierName); // <-- local var
  const platform_id =
    uiCode && platformsByCode
      ? platformsByCode.get(uiCode.toLowerCase()) ?? null
      : null;

  return {
    // If Admin assigned an id we use it (updates same row), else insert.
    delivery_id: localMeal.id || undefined, //map local id - DB PK
    delivery_label: (localMeal.label || "").trim(),
    accepted_at: acceptedISO,
    delivered_at: deliveredISO,
    duration_text: localMeal.duration || null,
    platform_id,
    is_checked: !!localMeal.checked,
  };
}

export function mapLocalToEarningsRow(localEarnings, userId) {
  const gh = localEarnings?.grubhub || {};
  const ue = localEarnings?.uberEats || {};
  const fix = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  };
  return {
    user_id: userId,
    grubhub_json: {
      deliveryPay: fix(gh.deliveryPay),
      tips: fix(gh.tips),
      adjustmentPay: fix(gh.adjustmentPay),
      total: fix(gh.total),
    },
    ubereats_json: {
      deliveryPay: fix(ue.deliveryPay),
      tips: fix(ue.tips),
      adjustmentPay: fix(ue.adjustmentPay),
      total: fix(ue.total),
    },
    grand_total: fix(localEarnings?.grandTotal),
    updated_at: new Date().toISOString(),
  };
}

// Build per-platform earnings rows for 'earnings' table
export function mapLocalToPlatformEarningsRows(
  localEarnings,
  userId,
  shiftId,
  platformsByCode
) {
  const rows = [];
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
  };
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const add = (uiName, payload) => {
    if (!payload) return;
    const code = (uiName || "").toLowerCase(); // "grubhub" / "ubereats"
    const platform_id = platformsByCode?.get(code);
    if (!platform_id) return;

    rows.push({
      user_id: userId,
      shift_id: shiftId ?? null, // ok if nullable
      platform_id, // smallint per your schema
      earnings_date: today,
      delivery_pay: toNum(payload.deliveryPay),
      tips: toNum(payload.tips),
      adjustment_pay: toNum(payload.adjustmentPay),
      total: toNum(payload.total),
    });
  };

  add("grubhub", localEarnings?.grubhub);
  add("ubereats", localEarnings?.uberEats);

  return rows;
}

// ----- reverse mappers for pull (DB → localStorage) -----

export function mapDeliveryRowToLocal(mealRow, platformsById) {
  // Recreate the exact UI strings your app expects
  const acceptedLocal = toLocaleOrEmpty(mealRow.accepted_at);
  const deliveredLocal = toLocaleOrEmpty(mealRow.delivered_at);
  const platCode =
    platformsById && mealRow
      ? platformsById.get(mealRow.platform_id) || ""
      : "";

  return {
    id: mealRow.delivery_id, // use DB PK
    label: mealRow.delivery_label || "",
    checked: !!mealRow.is_checked,
    timestamp: acceptedLocal ? `Accepted on: ${acceptedLocal}` : "",
    delivered: deliveredLocal || "",
    duration: mealRow.duration_text || "",
    courierName: codeToUiLabel(platCode),
  };
}

export function mapEarningsRowToLocal(earnRow) {
  return {
    grubhub: earnRow.grubhub_json || {},
    uberEats: earnRow.ubereats_json || {},
    grandTotal: earnRow.grand_total || "0.00",
  };
}
