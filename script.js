const MAX_MEALS = 25;
let activeMealElements = null;

/* ---------- Helpers ---------- */
function formatNow() {
  return new Date().toLocaleString();
}

// Attach caret-to-end behavior on focus for Earnings inputs
function attachEarningsCaretHandlers() {
  const earningsInputs = [
    "deliveryPayGrubhub",
    "tipsPayGrubhub",
    "adjustmentPayGrubhub",
    "deliveryPayUber",
    "tipsPayUber",
    "adjustmentPayUber",
  ];
  earningsInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.caretBound === "1") return; // avoid double-binding
    el.addEventListener("focus", () => {
      setTimeout(() => moveCaretToEnd(el), 0);
    });
    el.dataset.caretBound = "1";
  });
}

function formatForExport(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatDuration(start, end) {
  const diff = end - start;
  if (!isFinite(diff) || diff < 0) return "Pending";
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hrs} hour${hrs !== 1 ? "s" : ""} ${mins} minute${
    mins !== 1 ? "s" : ""
  }`;
}

/* ---------- Toast (used by copy) ---------- */
function showToast(msg) {
  const toast = document.getElementById("customToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show-toast");
  setTimeout(() => toast.classList.remove("show-toast"), 3000);
}

/* ---------- State ---------- */
function saveState() {
  const prev = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");

  // Base object seeded from previous to avoid accidental wipes
  const state = {
    meals: Array.isArray(prev.meals) ? prev.meals : [],
    startTime: prev.startTime || "",
    endTime: prev.endTime || "",
    odometerStart: prev.odometerStart || "",
    odometerEnd: prev.odometerEnd || "",
  };
  // Update start/end if present on page
  const startEl = document.getElementById("startTime");
  const endEl = document.getElementById("endTime");
  if (startEl && startEl.textContent.trim() !== "") {
    state.startTime = startEl.textContent.trim();
  }
  if (endEl && endEl.textContent.trim() !== "") {
    state.endTime = endEl.textContent.trim();
  }
  // Update odometers if present on page (Home)
  const odoStartEl = document.getElementById("odoStart");
  const odoEndEl = document.getElementById("odoEnd");
  if (odoStartEl && odoStartEl.value.trim() !== "") {
    state.odometerStart = odoStartEl.value.trim();
  }
  if (odoEndEl && odoEndEl.value.trim() !== "") {
    state.odometerEnd = odoEndEl.value.trim();
  }
  // Only rebuild the meals array on the Deliveries page (where the list exists)
  const hasDeliveriesList = !!document.getElementById("checkboxGroup");
  if (hasDeliveriesList) {
    state.meals = [];
    document.querySelectorAll(".checkbox-row").forEach((row) => {
      const checkbox = row.querySelector(".task-checkbox");
      const label = checkbox.dataset.label;
      const timestamp = row.querySelector(".timestamp").textContent;
      const delivered = row.dataset.delivered || "";
      const duration = row.dataset.duration || "";
      state.meals.push({
        label,
        checked: checkbox.checked,
        timestamp,
        delivered,
        duration,
      });
    });
  }
  // Persist
  localStorage.setItem("deliveryAppState", JSON.stringify(state));
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
  if (!saved.meals) saved.meals = [];

  // Deliveries page (deliveries.html)
  if (document.getElementById("checkboxGroup")) {
    const group = document.getElementById("checkboxGroup");
    group.innerHTML = "";
    if (saved.meals.length) {
      saved.meals.forEach((m) =>
        addMeal(m.label, m.checked, m.timestamp, m.delivered, m.duration)
      );
    } else {
      addMeal("1st Meal");
    }
    ensureCopyButton(); // single Copy Message button at bottom
  }

  // Earnings (labels)
  if (document.getElementById("earningsTotals")) {
    refreshEarningsLabels();
  }
}

// Optional: customize the base message via localStorage.setItem('copyBaseMessage', '...').
// Falls back to your original phrase if not set.
function getCopyBaseMessage() {
  return (
    localStorage.getItem("copyBaseMessage") ||
    "Thank you for your support and generous tip!  It goes a long way for my family."
  );
}
// copyText1() creates a personalized thank-you message based on the current time of day
// (morning, afternoon, evening) and copies it to the clipboard.
function copyText1() {
  const base = getCopyBaseMessage();
  const hour = new Date().getHours();
  let message = base;

  if (hour >= 5 && hour < 12) {
    message += " Have a blessed morning.";
  } else if (hour >= 12 && hour < 17) {
    message += " Have a blessed afternoon.";
  } else if (hour >= 17 && hour <= 23) {
    message += " Have a blessed evening.";
  } else {
    message += " Have a blessed day.";
  }

  navigator.clipboard.writeText(message).then(() => {
    if (typeof showToast === "function")
      showToast("Message copied to clipboard!");
  });
}

// ensureCopyButton() places the single "Copy Message" button below the most recent meal tile,
// always using copyText1() for its message, and preserves existing UI styling & Lucide icon.
function ensureCopyButton() {
  const group = document.getElementById("checkboxGroup");
  if (!group) return;

  let container = document.getElementById("copyMessageContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "copyMessageContainer";
    container.style.margin = "8px 0 14px 0";

    const btn = document.createElement("button");
    btn.id = "copyMessageBtn";
    btn.className = "btn-copyMessage"; // keep your existing styling
    btn.innerHTML = `<i data-lucide="copy"></i>`;
    btn.onclick = copyText1; // ← no fallback; always copy greeting

    container.appendChild(btn);
  } else {
    // If it exists, move it to the end (under the most recent tile)
    container.remove();
  }

  group.appendChild(container);

  // Ensure the icon renders after DOM insert
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

/* ---------- Deliveries UI ---------- */
function addMeal(
  label = null,
  isChecked = false,
  timestampValue = "",
  deliveredValue = "",
  durationValue = ""
) {
  const count = document.querySelectorAll(".checkbox-row").length;
  if (count >= MAX_MEALS) return;

  const group = document.getElementById("checkboxGroup");
  const row = document.createElement("div");
  row.className = "checkbox-row";

  const left = document.createElement("div");
  left.className = "checkbox-left";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-checkbox";

  const mealLabel = label || `${count + 1}${ordinalSuffix(count + 1)} Meal`;
  checkbox.dataset.label = mealLabel;
  checkbox.checked = isChecked;
  checkbox.disabled = !!deliveredValue;

  const labelSpan = document.createElement("span");
  labelSpan.className = "checkbox-label";
  labelSpan.textContent = mealLabel;

  const timestamp = document.createElement("span");
  timestamp.className = "timestamp";
  timestamp.textContent = timestampValue;

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.innerHTML = "&times;";
  removeBtn.style.display =
    count > 0 && !isChecked && !timestampValue ? "inline" : "none";
  removeBtn.onclick = () => {
    group.removeChild(row);
    ensureCopyButton(); // keep the single Copy button at bottom
    saveState();
  };

  const arrowBtn = document.createElement("button");
  arrowBtn.className = "arrow-btn";
  arrowBtn.innerHTML = "&gt;";
  arrowBtn.style.display = isChecked ? "inline" : "none";
  arrowBtn.onclick = () => {
    const latestDelivered = row.dataset.delivered || "Pending";
    const acceptedRaw = timestamp.textContent.replace("Accepted on: ", "");
    const acceptedDate = new Date(acceptedRaw);

    let duration = "Pending";
    if (row.dataset.delivered) {
      const deliveredDate = new Date(row.dataset.delivered);
      duration = formatDuration(acceptedDate, deliveredDate);
    } else if (acceptedRaw) {
      duration = formatDuration(acceptedDate, new Date());
    }

    document.getElementById("slideUpSheet").classList.remove("hidden");
    document.getElementById("mealLabelInSheet").textContent = mealLabel;
    document.getElementById("acceptedTimeInSheet").textContent =
      timestamp.textContent || "Pending";
    document.getElementById("deliveredTimeInSheet").textContent =
      latestDelivered;
    document.getElementById("durationInSheet").textContent = duration;

    const markBtn = document.getElementById("markDeliveredBtn");
    markBtn.disabled = !!row.dataset.delivered;

    activeMealElements = { row, timestamp, arrowBtn, checkbox };
  };

  if (deliveredValue) row.dataset.delivered = deliveredValue;
  if (durationValue) row.dataset.duration = durationValue;

  checkbox.addEventListener("click", () => {
    timestamp.textContent = checkbox.checked
      ? "Accepted on: " + formatNow()
      : "";
    updateIcons();
    saveState();
  });

  function updateIcons() {
    const showRemove = !checkbox.checked && !timestamp.textContent && count > 0;
    const showArrow = checkbox.checked;
    removeBtn.style.display = showRemove ? "inline" : "none";
    arrowBtn.style.display = showArrow ? "inline" : "none";
  }
  updateIcons();

  left.appendChild(checkbox);
  left.appendChild(labelSpan);
  left.appendChild(timestamp);

  row.appendChild(left);
  row.appendChild(removeBtn);
  row.appendChild(arrowBtn);
  group.appendChild(row);

  // Ensure a single, global Copy button appears once at the end
  ensureCopyButton();

  saveState();
}

function ordinalSuffix(i) {
  const j = i % 10,
    k = i % 100;
  if (j == 1 && k != 11) return "st";
  if (j == 2 && k != 12) return "nd";
  if (j == 3 && k != 13) return "rd";
  return "th";
}

function resetAll() {
  // 1) Clear storage
  localStorage.removeItem("deliveryAppState");
  localStorage.removeItem("earningsSummary");

  // 2) Reset Deliveries UI (supports single list or Active/Completed groups)
  const single = document.getElementById("checkboxGroup");
  const active = document.getElementById("checkboxGroupActive");
  const completed = document.getElementById("checkboxGroupCompleted");

  if (active || completed) {
    if (active) active.innerHTML = "";
    if (completed) completed.innerHTML = "";
    addMeal("1st Meal");
    if (typeof ensureCopyButton === "function") ensureCopyButton();
  } else if (single) {
    single.innerHTML = "";
    addMeal("1st Meal");
    if (typeof ensureCopyButton === "function") ensureCopyButton();
  }

  // 3) Reset Earnings UI (totals section)
  const gh = document.getElementById("ghTotal");
  const ue = document.getElementById("ueTotal");
  const grand = document.getElementById("grandTotal");
  if (gh) gh.textContent = "0.00";
  if (ue) ue.textContent = "0.00";
  if (grand) grand.textContent = "0.00";

  // 4) Reset Earnings slide-up inputs & computed labels (if sheet is present)

  const computedLabels = [
    "totalEarningsGrubhub",
    "totalEarningsUber",
    "grandTotalEarnings",
  ];
  computedLabels.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "Pending";
  });

  // 5) Refresh Home pills (if on Home)
  const earningsPill = document.getElementById("earningsPill");
  if (earningsPill) earningsPill.textContent = "Total Earnings: $0.00";

  // 6) Persist fresh state (adds back 1st Meal etc.)
  saveState();
}

/* ---------- Home page live logic ---------- */
let homeDurationTimer = null;

function initHomePage() {
  const deliveriesPill = document.getElementById("deliveriesPill");
  const earningsPill = document.getElementById("earningsPill");
  const mileagePill = document.getElementById("mileagePill");
  const durationPill = document.getElementById("durationPill");
  if (!deliveriesPill || !earningsPill || !mileagePill || !durationPill) return; // not on home

  const state = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
  const meals = Array.isArray(state.meals) ? state.meals : [];
  const deliveries = meals.filter((m) => m.checked).length;
  deliveriesPill.textContent = `Total Deliveries: ${deliveries} Deliveries`;

  const es = JSON.parse(localStorage.getItem("earningsSummary") || "{}");
  const grand = es?.grandTotal ? Number(es.grandTotal).toFixed(2) : "0.00";
  earningsPill.textContent = `Total Earnings: $${grand}`;

  const odoStartEl = document.getElementById("odoStart");
  const odoEndEl = document.getElementById("odoEnd");

  // Place caret at end when focusing odometer fields
  odoStartEl?.addEventListener("focus", () => {
    setTimeout(() => moveCaretToEnd(odoStartEl), 0);
  });
  odoEndEl?.addEventListener("focus", () => {
    setTimeout(() => moveCaretToEnd(odoEndEl), 0);
  });

  // Prefill odometers
  if (odoStartEl) odoStartEl.value = state?.odometerStart ?? "";
  if (odoEndEl) odoEndEl.value = state?.odometerEnd ?? "";

  function recomputeMileage() {
    const a = parseFloat(odoStartEl?.value);
    const b = parseFloat(odoEndEl?.value);
    let text = "Pending";
    if (!isNaN(a) && !isNaN(b) && b > a) text = `${(b - a).toFixed(1)} Miles`;
    mileagePill.textContent = `Total Mileage: ${text}`;
  }

  odoStartEl?.addEventListener("blur", () => {
    saveState();
    recomputeMileage();
  });
  odoEndEl?.addEventListener("blur", () => {
    saveState();
    recomputeMileage();
  });
  recomputeMileage();

  // Mirror start/end labels
  const startEl = document.getElementById("startTime");
  const endEl = document.getElementById("endTime");
  if (startEl) startEl.textContent = state?.startTime ?? "";
  if (endEl) endEl.textContent = state?.endTime ?? "";

  function tickDuration() {
    const startText = (
      document.getElementById("startTime")?.textContent || ""
    ).trim();
    const endText = (
      document.getElementById("endTime")?.textContent || ""
    ).trim();
    if (!startText) {
      durationPill.textContent = "Duration: Pending";
      return;
    }
    const start = new Date(startText);
    const end = endText ? new Date(endText) : new Date();
    durationPill.textContent = `Duration: ${formatDuration(start, end)}`;
  }

  clearInterval(homeDurationTimer);
  homeDurationTimer = setInterval(tickDuration, 1000);
  tickDuration();
}

/* ---------- Earnings helpers ---------- */
function refreshEarningsLabels() {
  const saved = JSON.parse(localStorage.getItem("earningsSummary") || "{}");
  const gh = saved.grubhub || {};
  const ue = saved.uberEats || {};
  if (document.getElementById("ghTotal"))
    document.getElementById("ghTotal").textContent = gh.total ?? "0.00";
  if (document.getElementById("ueTotal"))
    document.getElementById("ueTotal").textContent = ue.total ?? "0.00";
  if (document.getElementById("grandTotal"))
    document.getElementById("grandTotal").textContent =
      saved.grandTotal ?? "0.00";
}

/* ---------- Odometer field caret jump to end helpers ---------- */
function moveCaretToEnd(el) {
  if (!el) return;
  const len = (el.value || "").length;
  // Try the standard way
  try {
    el.setSelectionRange(len, len);
  } catch (_) {
    // Fallback for number inputs in some browsers
    const v = el.value;
    el.value = "";
    el.value = v;
  }
}

/* ---------- Lucide helpers ---------- */
function initIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

/* ---------- Export ---------- */
function exportToJson() {
  const deliveryAppState = JSON.parse(
    localStorage.getItem("deliveryAppState") || "{}"
  );
  const earningsSummary = JSON.parse(
    localStorage.getItem("earningsSummary") || "{}"
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    deliveryAppState,
    earningsSummary,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });

  const filename = "Export.json";

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();

  // optional toast
  if (typeof showToast === "function") showToast("Exported data as JSON");
}

/* ---------- Bottom nav highlight ---------- */
function setActiveNav() {
  const path = location.pathname.split("/").pop() || "home.html";
  document.querySelectorAll(".bottom-nav .nav-item").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const file = href.split("/").pop();
    a.classList.toggle("active", file === path);
  });
}

/* ---------- DOM Ready ---------- */
window.addEventListener("DOMContentLoaded", () => {
  loadState();

  // Start/End on any page that shows them (Home only)
  const startBtn = document.getElementById("startBtn");
  if (startBtn)
    startBtn.onclick = () => {
      const el = document.getElementById("startTime");
      if (el) el.textContent = formatNow();
      saveState();
      if (homeDurationTimer) {
        clearInterval(homeDurationTimer);
        homeDurationTimer = null;
      }
      initHomePage();
    };

  const endBtn = document.getElementById("endBtn");
  if (endBtn)
    endBtn.onclick = () => {
      const el = document.getElementById("endTime");
      if (el) el.textContent = formatNow();
      saveState();
      initHomePage();
    };

  // Add/Reset (Deliveries page)
  if (document.getElementById("addMealBtn"))
    document.getElementById("addMealBtn").onclick = () => addMeal();
  if (document.getElementById("resetBtn"))
    document.getElementById("resetBtn").onclick = resetAll;

  // Slide-up close buttons (if on page)
  if (document.getElementById("closeSheetBtn"))
    document.getElementById("closeSheetBtn").onclick = () =>
      document.getElementById("slideUpSheet").classList.add("hidden");
  if (document.getElementById("closeEarningsBtn"))
    document.getElementById("closeEarningsBtn").onclick = () =>
      document.getElementById("earningsSheet").classList.add("hidden");

  // Earnings open button (on earnings.html)
  if (document.getElementById("openEarningsBtn")) {
    document.getElementById("openEarningsBtn").onclick = () => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("earningsSummary") || "{}"
        );
        const gh = saved.grubhub || {};
        const ue = saved.uberEats || {};
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el)
            el.value = val != null && val !== "" ? Number(val).toFixed(2) : "";
        };
        setVal("deliveryPayGrubhub", gh.deliveryPay);
        setVal("tipsPayGrubhub", gh.tips);
        setVal("adjustmentPayGrubhub", gh.adjustmentPay);
        setVal("deliveryPayUber", ue.deliveryPay);
        setVal("tipsPayUber", ue.tips);
        setVal("adjustmentPayUber", ue.adjustmentPay);

        const setText = (id, val) => {
          const el = document.getElementById(id);
          if (el)
            el.textContent =
              val != null && val !== "" ? Number(val).toFixed(2) : "Pending";
        };
        setText("totalEarningsGrubhub", gh.total);
        setText("totalEarningsUber", ue.total);
        setText("grandTotalEarnings", saved.grandTotal);
      } catch (_) {}
      attachEarningsCaretHandlers();

      document.getElementById("earningsSheet").classList.remove("hidden");
    };
  }

  // Earnings calculate & auto-close
  if (document.getElementById("calcEarningsBtn")) {
    document
      .getElementById("calcEarningsBtn")
      .addEventListener("click", function () {
        const ghDelivery =
          parseFloat(document.getElementById("deliveryPayGrubhub").value) || 0;
        const ghTips =
          parseFloat(document.getElementById("tipsPayGrubhub").value) || 0;
        const ghAdjust =
          parseFloat(document.getElementById("adjustmentPayGrubhub").value) ||
          0;
        const ueDelivery =
          parseFloat(document.getElementById("deliveryPayUber").value) || 0;
        const ueTips =
          parseFloat(document.getElementById("tipsPayUber").value) || 0;
        const ueAdjust =
          parseFloat(document.getElementById("adjustmentPayUber").value) || 0;

        const totalGrubhub = ghDelivery + ghTips + ghAdjust;
        const totalUber = ueDelivery + ueTips + ueAdjust;
        const grandTotal = totalGrubhub + totalUber;

        document.getElementById("totalEarningsGrubhub").textContent =
          totalGrubhub.toFixed(2);
        document.getElementById("totalEarningsUber").textContent =
          totalUber.toFixed(2);
        document.getElementById("grandTotalEarnings").textContent =
          grandTotal.toFixed(2);

        const earningsData = {
          grubhub: {
            deliveryPay: ghDelivery.toFixed(2),
            tips: ghTips.toFixed(2),
            adjustmentPay: ghAdjust.toFixed(2),
            total: totalGrubhub.toFixed(2),
          },
          uberEats: {
            deliveryPay: ueDelivery.toFixed(2),
            tips: ueTips.toFixed(2),
            adjustmentPay: ueAdjust.toFixed(2),
            total: totalUber.toFixed(2),
          },
          grandTotal: grandTotal.toFixed(2),
        };
        localStorage.setItem("earningsSummary", JSON.stringify(earningsData));

        document.getElementById("earningsSheet").classList.add("hidden");
        refreshEarningsLabels();
      });
  }

  // Export (More page)
  const exportBtn = document.getElementById("exportJsonBtn");
  if (exportBtn) exportBtn.addEventListener("click", exportToJson);

  // Delivered button inside slide-up sheet (Deliveries page)
  const deliveredBtn = document.getElementById("markDeliveredBtn");
  if (deliveredBtn)
    deliveredBtn.onclick = () => {
      if (!activeMealElements) return;

      const deliveredNow = new Date();
      const deliveredStr = deliveredNow.toLocaleString();
      const acceptedStr = activeMealElements.timestamp.textContent.replace(
        "Accepted on: ",
        ""
      );
      const acceptedDate = new Date(acceptedStr);
      const durationStr = formatDuration(acceptedDate, deliveredNow);

      // Update UI in the sheet
      document.getElementById("deliveredTimeInSheet").textContent =
        deliveredStr;
      document.getElementById("durationInSheet").textContent = durationStr;

      // Lock button for this tile
      deliveredBtn.disabled = true;

      // Persist on the tile
      activeMealElements.row.dataset.delivered = deliveredStr;
      activeMealElements.row.dataset.duration = durationStr;
      activeMealElements.checkbox.disabled = true;

      // Save state
      saveState();

      // ✅ Close the slide-up after saving
      document.getElementById("slideUpSheet").classList.add("hidden");

      // Clean up reference
      activeMealElements = null;
    };

  // Init Lucide
  initIcons();

  // Nav active state
  setActiveNav();

  // Home live updates
  initHomePage();
});

/* Save on unload */
window.addEventListener("beforeunload", saveState);

/* Sync across tabs/pages */
window.addEventListener("storage", (e) => {
  if (e.key === "deliveryAppState" || e.key === "adminTriggerRefresh") {
    loadState();
    initHomePage();
    setActiveNav();
  }
});

// Re-initialize icons on bfcache restores (e.g., navigating back to a page)
window.addEventListener("pageshow", initIcons);
