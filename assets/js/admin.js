/* ============================
   Admin — Card-based editor
   ============================ */

/* -------- Admin Utilities (unchanged behavior) -------- */
function toInputValueFromLocaleString(localeStr) {
  // localeStr like "8/12/2025, 10:15:32 PM" or "" → "YYYY-MM-DDTHH:MM:SS"
  if (!localeStr) return "";
  const d = new Date(localeStr);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toLocaleStringFromInputValue(inputVal) {
  // inputVal like "2025-08-12T22:11:33" → local string
  if (!inputVal) return "";
  const d = new Date(inputVal);
  if (isNaN(d)) return "";
  return d.toLocaleString();
}

function parseAcceptedRaw(acceptedText) {
  // "Accepted on: 8/12/2025, 10:15:32 PM" → "8/12/2025, 10:15:32 PM"
  if (!acceptedText) return "";
  return acceptedText.replace(/^Accepted on:\s*/i, "");
}

function buildAcceptedDisplay(localeStr) {
  return localeStr ? `Accepted on: ${localeStr}` : "";
}

function formatDurationHM(startDate, endDate) {
  const diff = endDate - startDate;
  if (!isFinite(diff) || diff < 0) return "";
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  return `${hrs} hour${hrs !== 1 ? "s" : ""} ${mins} minute${
    mins !== 1 ? "s" : ""
  }`;
}

function ensureMealIds(state) {
  let mutated = false;
  state.meals.forEach((m) => {
    if (!m.id) {
      // lightweight UUID
      m.id = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        (
          c ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16)
      );
      mutated = true;
    }
  });
  if (mutated) {
    localStorage.setItem("deliveryAppState", JSON.stringify(state));
  }
  return state;
}

function loadStateAdmin() {
  const state = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
  if (!state.meals) state.meals = [];
  return ensureMealIds(state);
}

function saveStateAdmin(state) {
  localStorage.setItem("deliveryAppState", JSON.stringify(state));
  // Soft refresh signal for main page
  localStorage.setItem("adminTriggerRefresh", String(Date.now()));
}

/* -------- NEW: seconds normalization & jitter helpers -------- */
function normalizeISOWithSeconds(val) {
  // Ensure "YYYY-MM-DDTHH:mm:ss" shape (strip milliseconds if present)
  if (!val) return "";
  // add :00 if seconds missing
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) return `${val}:00`;
  // strip milliseconds if any
  return val.replace(/(\d{2})(\.\d+)?$/, "$1");
}

function jitterSecondsIfZero(iso) {
  // If seconds are "00", replace with random 1..59 to avoid iOS default zeros
  if (!iso) return "";
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):(\d{2})$/);
  if (!m) return iso;
  const seconds = m[2];
  if (seconds !== "00") return iso;
  const rand = Math.floor(Math.random() * 59) + 1; // 1..59
  return `${m[1]}:${String(rand).padStart(2, "0")}`;
}

function addSeconds(iso, secondsToAdd) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  d.setSeconds(d.getSeconds() + secondsToAdd);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ensureDeliveredNotBeforeAccepted(accISO, delISO) {
  if (!accISO || !delISO) return { accISO, delISO };
  const a = new Date(accISO);
  const d = new Date(delISO);
  if (isNaN(a) || isNaN(d)) return { accISO, delISO };
  if (d < a) {
    // bump delivered to be 1s after accepted
    return { accISO, delISO: addSeconds(accISO, 1) };
  }
  return { accISO, delISO };
}

/* -------- Render Cards (replaces table UI) -------- */
function renderCards() {
  const container = document.getElementById("adminList");
  if (!container) return;
  container.innerHTML = "";

  const state = loadStateAdmin();

  state.meals
    // Only show meals that have any time data (as before)
    .filter(
      (m) =>
        (m.timestamp && m.timestamp.trim()) ||
        (m.delivered && m.delivered.trim())
    )
    .forEach((meal) => {
      const acceptedRaw = parseAcceptedRaw(meal.timestamp || "");
      const acceptedVal = toInputValueFromLocaleString(acceptedRaw);
      const deliveredVal = toInputValueFromLocaleString(meal.delivered || "");

      const card = document.createElement("section");
      card.className = "card meal-card";
      card.dataset.id = meal.id;

      card.innerHTML = `
        <h4>${meal.label || "Meal"}</h4>
        <div class="row">
          <label for="acc-${meal.id}">Accepted</label>
          <input id="acc-${
            meal.id
          }" class="accepted-input" type="datetime-local" step="1" value="${acceptedVal}" />
        </div>
        <div class="row">
          <label for="del-${meal.id}">Delivered</label>
          <input id="del-${
            meal.id
          }" class="delivered-input" type="datetime-local" step="1" value="${deliveredVal}" />
        </div>
      `;

      container.appendChild(card);
    });
}

/* -------- Validation (same rules as table version) -------- */
function validateAllCards() {
  const cards = Array.from(document.querySelectorAll("#adminList .meal-card"));
  const errors = [];

  cards.forEach((card) => {
    const id = card.dataset.id;
    const acceptedInput = card.querySelector(".accepted-input");
    const deliveredInput = card.querySelector(".delivered-input");
    const aVal = acceptedInput?.value || "";
    const dVal = deliveredInput?.value || "";

    // If accepted cleared, delivered must also clear
    if (!aVal && dVal) {
      errors.push(`Meal ${id}: Delivered cannot exist if Accepted is empty.`);
      return;
    }

    if (aVal && dVal) {
      const aDate = new Date(aVal);
      const dDate = new Date(dVal);
      if (isNaN(aDate) || isNaN(dDate)) {
        errors.push(`Meal ${id}: Invalid date/time value.`);
      } else if (dDate < aDate) {
        errors.push(`Meal ${id}: Delivered must be on/after Accepted.`);
      }
    }
  });

  return errors;
}

/* -------- Bulk Save -------- */
function handleBulkSave() {
  const errorBox = document.getElementById("errorBox");
  const successBox = document.getElementById("successBox");
  if (errorBox) {
    errorBox.style.display = "none";
    errorBox.textContent = "";
  }
  if (successBox) {
    successBox.style.display = "none";
    successBox.textContent = "";
  }

  const errors = validateAllCards();
  if (errors.length) {
    if (errorBox) {
      errorBox.textContent = errors.join("\n");
      errorBox.style.display = "block";
    }
    return;
  }

  const state = loadStateAdmin();

  // Build a map from the card inputs
  const map = new Map();
  document.querySelectorAll("#adminList .meal-card").forEach((card) => {
    const id = card.dataset.id;
    let a = card.querySelector(".accepted-input")?.value || "";
    let d = card.querySelector(".delivered-input")?.value || "";

    // --- NEW: normalize + jitter seconds if ":00" or seconds missing ---
    a = normalizeISOWithSeconds(a);
    d = normalizeISOWithSeconds(d);
    a = jitterSecondsIfZero(a);
    d = jitterSecondsIfZero(d);

    // --- NEW: guarantee Delivered >= Accepted (if both present) ---
    const fixed = ensureDeliveredNotBeforeAccepted(a, d);
    a = fixed.accISO;
    d = fixed.delISO;

    map.set(id, { acceptedISO: a, deliveredISO: d });
  });

  state.meals.forEach((meal) => {
    if (!map.has(meal.id)) return;

    const { acceptedISO, deliveredISO } = map.get(meal.id);

    // Apply the clearing rule & keep same storage format
    const acceptedLocale = acceptedISO
      ? toLocaleStringFromInputValue(acceptedISO)
      : "";
    const deliveredLocale = acceptedISO
      ? deliveredISO
        ? toLocaleStringFromInputValue(deliveredISO)
        : ""
      : ""; // accepted empty ⇒ delivered cleared

    meal.timestamp = acceptedLocale ? buildAcceptedDisplay(acceptedLocale) : "";
    meal.delivered = deliveredLocale;

    // Recompute duration if both exist
    if (acceptedLocale && deliveredLocale) {
      const a = new Date(acceptedLocale);
      const d = new Date(deliveredLocale);
      meal.duration = isNaN(a) || isNaN(d) ? "" : formatDurationHM(a, d);
    } else {
      meal.duration = "";
    }
  });

  saveStateAdmin(state);

  if (successBox) {
    successBox.textContent =
      "All changes saved. Seconds auto-adjusted where needed.";
    successBox.style.display = "block";
  }
}

/* -------- Init -------- */
document.addEventListener("DOMContentLoaded", () => {
  renderCards();

  const saveBtn = document.getElementById("bulkSaveBtn");
  const reloadBtn = document.getElementById("reloadBtn");
  if (saveBtn) saveBtn.addEventListener("click", handleBulkSave);
  if (reloadBtn) reloadBtn.addEventListener("click", renderCards);
});

/* Soft-refresh when Admin updates localStorage from another tab/page */
window.addEventListener("storage", (e) => {
  if (e.key === "deliveryAppState" || e.key === "adminTriggerRefresh") {
    renderCards();
  }
});
