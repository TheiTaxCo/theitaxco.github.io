// assets/js/sync.supabase.js
import {
  listDeliveries,
  upsertDelivery,
  getEarnings,
  saveEarnings,
} from "./db.supabase.js";

export async function pushLocalToCloud() {
  const local = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
  const meals = Array.isArray(local.meals) ? local.meals : [];
  for (const m of meals) {
    await upsertDelivery({
      label: m.label,
      accepted_at: m.timestamp || null,
      delivered_at: m.delivered || null,
      duration_text: m.duration || null,
      courier_name: m.courierName || null,
      checked: !!m.checked,
    });
  }

  const es = JSON.parse(localStorage.getItem("earningsSummary") || "{}");
  if (Object.keys(es).length) await saveEarnings(es);
}

export async function pullCloudToLocal() {
  const rows = await listDeliveries();
  const meals = rows.map((r) => ({
    label: r.label,
    checked: !!r.checked,
    timestamp: r.accepted_at || "",
    delivered: r.delivered_at || "",
    duration: r.duration_text || "",
    courierName: r.courier_name || "",
  }));

  const earnings = await getEarnings();
  const es = earnings
    ? {
        grubhub: earnings.grubhub_json || {},
        uberEats: earnings.ubereats_json || {},
        grandTotal: earnings.grand_total || "0.00",
      }
    : {};

  localStorage.setItem(
    "deliveryAppState",
    JSON.stringify({
      ...JSON.parse(localStorage.getItem("deliveryAppState") || "{}"),
      meals,
    })
  );
  if (earnings) localStorage.setItem("earningsSummary", JSON.stringify(es));
}
