/* ============================
   EarnRoute — App Script
   ============================ */

const MAX_MEALS = 25;
let activeMealElements = null;

/* ---------- New: slide-up live timer ---------- */
let slideDurationTimer = null;

/* ---------- Helpers ---------- */
function formatNow() {
  return new Date().toLocaleString();
}

/* Human readable HMS (with seconds) */
function formatDurationHMS(start, end) {
  const diff = end - start;
  if (!isFinite(diff) || diff < 0) return "Pending";
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hrs} hour${hrs !== 1 ? "s" : ""} ${mins} minute${
    mins !== 1 ? "s" : ""
  } ${secs} second${secs !== 1 ? "s" : ""}`;
}

/* Existing (HH/MM only) — used elsewhere (Home, completed calc, etc.) */
function formatDuration(start, end) {
  const diff = end - start;
  if (!isFinite(diff) || diff < 0) return "Pending";
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hrs} hour${hrs !== 1 ? "s" : ""} ${mins} minute${
    mins !== 1 ? "s" : ""
  }`;
}

/* ---------- Slide-up Sheets (no backdrop-to-close) ---------- */
function openSheet(sheetEl) {
  if (!sheetEl) return;
  const backdrop = document.getElementById("modalBackdrop");
  sheetEl.classList.remove("hidden");
  document.body.classList.add("modal-open");
  if (backdrop) backdrop.classList.add("show");
}
function closeSheet(sheetEl) {
  if (!sheetEl) return;
  const backdrop = document.getElementById("modalBackdrop");
  sheetEl.classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (backdrop) backdrop.classList.remove("show");
}

/* ---------- Earnings caret handlers ---------- */
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
    if (!el || el.dataset.caretBound === "1") return;
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

  // ✅ Only rebuild meals array if we're on Deliveries (i.e., tiles exist)
  const rows = document.querySelectorAll(".checkbox-row");
  if (rows.length > 0) {
    const nextMeals = [];
    rows.forEach((row) => {
      const checkbox = row.querySelector(".task-checkbox");
      const label = checkbox?.dataset.label || "";
      const timestamp = row.querySelector(".timestamp")?.textContent || "";
      const delivered = row.dataset.delivered || "";
      const duration = row.dataset.duration || "";
      const courierName = row.dataset.courier || ""; // persist courier
      nextMeals.push({
        label,
        checked: !!checkbox?.checked,
        timestamp,
        delivered,
        duration,
        courierName,
      });
    });
    state.meals = nextMeals;
  }
  // else: keep previous meals as-is to avoid wiping when not on Deliveries

  localStorage.setItem("deliveryAppState", JSON.stringify(state));
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
  if (!saved.meals) saved.meals = [];

  const active = document.getElementById("checkboxGroupActive");
  const completed = document.getElementById("checkboxGroupCompleted");
  const single = document.getElementById("checkboxGroup");

  if (active || completed) {
    if (active) active.innerHTML = "";
    if (completed) completed.innerHTML = "";

    if (saved.meals.length) {
      const activeMeals = [];
      const completedMeals = [];
      saved.meals.forEach((m) => {
        if (m.delivered && m.delivered.trim() !== "") {
          completedMeals.push(m);
        } else {
          activeMeals.push(m);
        }
      });

      // Sort completed by ACCEPTED timestamp (oldest first)
      completedMeals.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0);
        const dateB = new Date(b.timestamp || 0);
        return dateA - dateB;
      });

      activeMeals.forEach((m) =>
        addMeal(
          m.label,
          m.checked,
          m.timestamp,
          m.delivered,
          m.duration,
          active,
          m.courierName || ""
        )
      );
      completedMeals.forEach((m) =>
        addMeal(
          m.label,
          m.checked,
          m.timestamp,
          m.delivered,
          m.duration,
          completed,
          m.courierName || ""
        )
      );
    } else if (active) {
      addMeal("1st Meal", false, "", "", "", active, "");
    }

    ensureCopyButton();
  } else if (single) {
    single.innerHTML = "";
    if (saved.meals.length) {
      saved.meals.forEach((m) =>
        addMeal(
          m.label,
          m.checked,
          m.timestamp,
          m.delivered,
          m.duration,
          single,
          m.courierName || ""
        )
      );
    } else {
      addMeal("1st Meal", false, "", "", "", single, "");
    }
    ensureCopyButton();
  }

  // Earnings (labels)
  if (document.getElementById("earningsTotals")) {
    refreshEarningsLabels();
  }
}

/* ---------- Copy message (time-of-day greeting) ---------- */
function getCopyBaseMessage() {
  return (
    localStorage.getItem("copyBaseMessage") ||
    "Thank you for your support and generous tip!  It goes a long way for my family."
  );
}
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

/* ---------- SINGLE Copy Message button (once under last ACTIVE tile) ---------- */
function ensureCopyButton() {
  const activeGroup =
    document.getElementById("checkboxGroupActive") ||
    document.getElementById("checkboxGroup");
  if (!activeGroup) return;

  let container = document.getElementById("copyMessageContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "copyMessageContainer";
    container.style.margin = "8px 0 14px 0";

    const btn = document.createElement("button");
    btn.id = "copyMessageBtn";
    btn.className = "btn-copyMessage";
    btn.innerHTML = `<i data-lucide="copy"></i>`;
    btn.onclick = copyText1;

    container.appendChild(btn);
  } else {
    // move it to the end of ACTIVE group
    container.remove();
  }

  activeGroup.appendChild(container);

  // Refresh icon
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
  durationValue = "",
  targetGroupEl = null,
  courierNameValue = "" // restore courier
) {
  const totalRows = document.querySelectorAll(".checkbox-row").length;
  if (totalRows >= MAX_MEALS) return;

  const activeSplit = document.getElementById("checkboxGroupActive");
  const completedSplit = document.getElementById("checkboxGroupCompleted");
  let group =
    targetGroupEl ||
    document.getElementById("checkboxGroup") ||
    (deliveredValue ? completedSplit : activeSplit);
  if (!group) return;

  const row = document.createElement("div");
  row.className = "checkbox-row";

  const left = document.createElement("div");
  left.className = "checkbox-left";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-checkbox";

  const mealLabel =
    label || `${totalRows + 1}${ordinalSuffix(totalRows + 1)} Meal`;
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
    totalRows > 0 && !isChecked && !timestampValue ? "inline" : "none";
  removeBtn.onclick = () => {
    const parent = row.parentElement;
    parent.removeChild(row);
    ensureCopyButton();
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
      duration = formatDurationHMS(acceptedDate, deliveredDate);
    } else if (acceptedRaw) {
      duration = formatDurationHMS(acceptedDate, new Date());
    }

    // OPEN deliveries sheet with backdrop
    openSheet(document.getElementById("slideUpSheet"));
    document.getElementById("mealLabelInSheet").textContent = mealLabel;
    document.getElementById("acceptedTimeInSheet").textContent =
      timestamp.textContent || "Pending";
    document.getElementById("deliveredTimeInSheet").textContent =
      latestDelivered;
    document.getElementById("durationInSheet").textContent = duration;

    const markBtn = document.getElementById("markDeliveredBtn");
    const ghBtn = document.getElementById("btnCourierGH");
    const ueBtn = document.getElementById("btnCourierUE");

    // Helper to update selected visual state
    function updateCourierUI(name) {
      const ghSelected = name === "grubHub";
      const ueSelected = name === "uberEats";
      ghBtn.classList.toggle("selected", ghSelected);
      ueBtn.classList.toggle("selected", ueSelected);
      ghBtn.setAttribute("aria-pressed", ghSelected ? "true" : "false");
      ueBtn.setAttribute("aria-pressed", ueSelected ? "true" : "false");
    }

    // Init state from dataset
    const currentCourier = row.dataset.courier || "";
    updateCourierUI(currentCourier);

    // Enable Delivered iff a courier is picked and not already delivered
    markBtn.disabled = !!row.dataset.delivered || !currentCourier;

    // Disable courier controls if already delivered
    const deliveredAlready = !!row.dataset.delivered;
    ghBtn.disabled = deliveredAlready;
    ueBtn.disabled = deliveredAlready;

    // Click handlers (no-op if delivered)
    function selectCourier(name) {
      if (deliveredAlready) return;
      row.dataset.courier = name;
      updateCourierUI(name);
      applyTileClasses(row); // recolor ACTIVE tile immediately
      markBtn.disabled = false; // enable Delivered once courier set
      saveState();
    }
    ghBtn.onclick = () => selectCourier("grubHub");
    ueBtn.onclick = () => selectCourier("uberEats");

    // --- Live seconds counter while sheet is open for active (not delivered) ---
    clearInterval(slideDurationTimer);
    if (!row.dataset.delivered && acceptedRaw) {
      slideDurationTimer = setInterval(() => {
        document.getElementById("durationInSheet").textContent =
          formatDurationHMS(acceptedDate, new Date());
      }, 1000);
    } else {
      slideDurationTimer = null;
    }

    activeMealElements = { row, timestamp, arrowBtn, checkbox };
  };

  if (deliveredValue) row.dataset.delivered = deliveredValue;
  if (durationValue) row.dataset.duration = durationValue;
  if (courierNameValue) row.dataset.courier = courierNameValue; // restore courier

  checkbox.addEventListener("click", () => {
    timestamp.textContent = checkbox.checked
      ? "Accepted on: " + formatNow()
      : "";
    updateIcons();
    saveState();
  });

  function updateIcons() {
    const showRemove =
      !checkbox.checked && !timestamp.textContent && totalRows > 0;
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

  /* Apply classes for active/completed AND courier color */
  applyTileClasses(row);

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

/* ---------- Tile state → CSS classes (active/completed + courier) ---------- */
function applyTileClasses(row) {
  // clean slate
  row.classList.remove("active", "completed", "grubhub", "ubereats");

  const delivered = (row.dataset.delivered || "").trim();
  const courier = (row.dataset.courier || "").toLowerCase(); // "grubhub"|"ubereats"|"" (from "grubHub"/"uberEats")

  if (delivered) {
    row.classList.add("completed");
  } else {
    row.classList.add("active");
  }

  // Always add courier if known so CSS can color stripe
  if (courier === "grubhub") row.classList.add("grubhub");
  if (courier === "ubereats") row.classList.add("ubereats");
}

/* ---------- Reset ---------- */
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
    addMeal("1st Meal", false, "", "", "", active, "");
    ensureCopyButton();
  } else if (single) {
    single.innerHTML = "";
    addMeal("1st Meal", false, "", "", "", single, "");
    ensureCopyButton();
  }

  // 3) Reset Earnings UI (totals section)
  const gh = document.getElementById("ghTotal");
  const ue = document.getElementById("ueTotal");
  const grand = document.getElementById("grandTotal");
  if (gh) gh.textContent = "0.00";
  if (ue) ue.textContent = "0.00";
  if (grand) grand.textContent = "0.00";

  // 4) Reset Earnings computed labels (if present)
  ["totalEarningsGrubhub", "totalEarningsUber", "grandTotalEarnings"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "Pending";
    }
  );

  // 5) Refresh Home pill (if on Home)
  const earningsPill = document.getElementById("earningsPill");
  if (earningsPill) earningsPill.textContent = "Total Earnings: $0.00";

  // 6) Persist fresh state
  saveState();
}

/* ---------- Home page live logic ---------- */
let homeDurationTimer = null;

function initHomePage() {
  const deliveriesPill = document.getElementById("deliveriesPill");
  const earningsPill = document.getElementById("earningsPill");
  const mileagePill = document.getElementById("mileagePill");
  const durationPill = document.getElementById("durationPill");
  if (!deliveriesPill || !earningsPill || !mileagePill || !durationPill) return;

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

/* ---------- Odometer caret helper ---------- */
function moveCaretToEnd(el) {
  if (!el) return;
  const len = (el.value || "").length;
  try {
    el.setSelectionRange(len, len);
  } catch (_) {
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

/* ---------- Export (More) ---------- */
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

function openDrawer() {
  const drawer = document.getElementById("sideDrawer");
  const backdrop = document.getElementById("modalBackdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.add("open");
  backdrop.classList.add("show");
  document.body.classList.add("modal-open"); // prevent background scroll
}

function closeDrawer() {
  const drawer = document.getElementById("sideDrawer");
  const backdrop = document.getElementById("modalBackdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.remove("open");
  backdrop.classList.remove("show");
  document.body.classList.remove("modal-open");
}

function toggleDrawer() {
  const drawer = document.getElementById("sideDrawer");
  if (!drawer) return;
  if (drawer.classList.contains("open")) closeDrawer();
  else openDrawer();
}

/* ---------- Inject CSS for active courier colors (no change to style.css) ---------- */
function injectActiveCourierStyles() {
  if (document.getElementById("er-active-courier-css")) return;
  const style = document.createElement("style");
  style.id = "er-active-courier-css";
  style.textContent = `
       .checkbox-row.active.grubhub::before { background: #ff6100; }
       .checkbox-row.active.ubereats::before { background: #035d1f; }
     `;
  document.head.appendChild(style);
}

/* ---------- DOM Ready ---------- */
window.addEventListener("DOMContentLoaded", () => {
  // Inject minimal CSS so active tiles can be courier-colored
  injectActiveCourierStyles();

  // Icons (header + bottom nav)
  initIcons();
  const hdr = document.querySelector('.app-header [data-lucide="menu"]');
  if (hdr && window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  loadState();

  // Header hamburger opens/closes the drawer
  const headerHamburger = document.querySelector(".app-header .hamburger");
  if (headerHamburger) {
    headerHamburger.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDrawer();
    });
  }

  // Drawer close button
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener("click", closeDrawer);
  }

  // (Optional) Close on ESC key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // Logout button (works with or without Supabase present)
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        // Supabase sign-out if available
        if (window.supabase && supabase.auth?.signOut) {
          await supabase.auth.signOut();
        }
      } catch (_) {}
      // Optional: keep app data; if you want to wipe, uncomment:
      // localStorage.clear();

      closeDrawer();
      window.location.href = "./login.html"; // adjust path if needed
    });
  }

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

  // Slide-up close buttons (if on page) — ensure timer stops on close
  if (document.getElementById("closeSheetBtn"))
    document.getElementById("closeSheetBtn").onclick = () => {
      clearInterval(slideDurationTimer);
      slideDurationTimer = null;
      closeSheet(document.getElementById("slideUpSheet"));
    };
  if (document.getElementById("closeEarningsBtn"))
    document.getElementById("closeEarningsBtn").onclick = () =>
      closeSheet(document.getElementById("earningsSheet"));

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
      openSheet(document.getElementById("earningsSheet"));
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

        closeSheet(document.getElementById("earningsSheet"));
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
      const acceptedStr = activeMealElements.timestamp.textContent
        .replace("Accepted on: ", "")
        .trim();
      const acceptedDate = new Date(acceptedStr);
      const durationStr = formatDuration(acceptedDate, deliveredNow);

      // Update UI in the sheet
      document.getElementById("deliveredTimeInSheet").textContent =
        deliveredStr;
      document.getElementById("durationInSheet").textContent = durationStr;

      // Persist on the tile
      const row = activeMealElements.row;
      row.dataset.delivered = deliveredStr;
      row.dataset.duration = durationStr;

      // Lock checkbox & delivered button & courier buttons
      activeMealElements.checkbox.disabled = true;

      /* Update tile classes to completed + courier color */
      applyTileClasses(activeMealElements.row);
      deliveredBtn.disabled = true;
      const ghBtn = document.getElementById("btnCourierGH");
      const ueBtn = document.getElementById("btnCourierUE");
      if (ghBtn) ghBtn.disabled = true;
      if (ueBtn) ueBtn.disabled = true;

      // Move tile to COMPLETED in accepted-time order (oldest first)
      const completed = document.getElementById("checkboxGroupCompleted");
      if (completed) {
        if (row.parentElement !== completed) {
          const accTime = new Date(acceptedStr).getTime();
          const thisTime = isNaN(accTime) ? Number.POSITIVE_INFINITY : accTime;

          const completedRows = Array.from(
            completed.querySelectorAll(".checkbox-row")
          );

          let insertBeforeNode = null;
          for (const r of completedRows) {
            const rAcceptedRaw = (
              r.querySelector(".timestamp")?.textContent || ""
            )
              .replace("Accepted on: ", "")
              .trim();
            const rTime = new Date(rAcceptedRaw).getTime();
            const rComparable = isNaN(rTime) ? Number.POSITIVE_INFINITY : rTime;
            if (thisTime < rComparable) {
              insertBeforeNode = r;
              break;
            }
          }
          if (insertBeforeNode) completed.insertBefore(row, insertBeforeNode);
          else completed.appendChild(row);
        }
      }

      saveState();

      // Stop live sheet timer and close sheet
      clearInterval(slideDurationTimer);
      slideDurationTimer = null;
      closeSheet(document.getElementById("slideUpSheet"));

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
