// -------- Admin Utilities --------
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
  // acceptedText is like "Accepted on: 8/12/2025, 10:15:32 PM" → "8/12/2025, 10:15:32 PM"
  if (!acceptedText) return "";
  return acceptedText.replace(/^Accepted on:\s*/i, "");
}

function buildAcceptedDisplay(localeStr) {
  // back to "Accepted on: <localeStr>"
  if (!localeStr) return "";
  return `Accepted on: ${localeStr}`;
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
  // Add a stable id per meal if missing; keep existing structure untouched.
  let mutated = false;
  state.meals.forEach((m, idx) => {
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

// -------- Render Table --------
function renderTable() {
  const tbody = document.querySelector("#adminTable tbody");
  tbody.innerHTML = "";

  const state = loadStateAdmin();

  state.meals
    // show only those with any timestamp data
    .filter(
      (m) =>
        (m.timestamp && m.timestamp.trim()) ||
        (m.delivered && m.delivered.trim())
    )
    .forEach((meal) => {
      const tr = document.createElement("tr");
      tr.dataset.id = meal.id;

      const tdLabel = document.createElement("td");
      tdLabel.textContent = meal.label || "(Untitled Meal)";

      const tdAccepted = document.createElement("td");
      const acceptedRaw = parseAcceptedRaw(meal.timestamp || "");
      const acceptedInput = document.createElement("input");
      acceptedInput.type = "datetime-local";
      acceptedInput.step = "1";
      acceptedInput.value = toInputValueFromLocaleString(acceptedRaw);
      tdAccepted.appendChild(acceptedInput);

      const tdDelivered = document.createElement("td");
      const deliveredInput = document.createElement("input");
      deliveredInput.type = "datetime-local";
      deliveredInput.step = "1";
      deliveredInput.value = toInputValueFromLocaleString(meal.delivered || "");
      tdDelivered.appendChild(deliveredInput);

      tr.appendChild(tdLabel);
      tr.appendChild(tdAccepted);
      tr.appendChild(tdDelivered);
      tbody.appendChild(tr);
    });
}

// -------- Validation --------
function validateAllRows() {
  const rows = Array.from(document.querySelectorAll("#adminTable tbody tr"));
  const errors = [];

  rows.forEach((tr) => {
    const id = tr.dataset.id;
    const [acceptedInput, deliveredInput] = tr.querySelectorAll(
      'input[type="datetime-local"]'
    );

    const aVal = acceptedInput.value;
    const dVal = deliveredInput.value;

    // If accepted cleared, delivered must also clear (per your rule)
    if (!aVal && dVal) {
      errors.push(
        `Meal row ${id}: Delivered cannot exist if Accepted is empty.`
      );
      return;
    }

    if (aVal && dVal) {
      const aDate = new Date(aVal);
      const dDate = new Date(dVal);
      if (isNaN(aDate) || isNaN(dDate)) {
        errors.push(`Meal row ${id}: Invalid date/time value.`);
      } else if (dDate < aDate) {
        errors.push(`Meal row ${id}: Delivered must be on/after Accepted.`);
      }
    }
  });

  return errors;
}

// -------- Bulk Save --------
function handleBulkSave() {
  const errorBox = document.getElementById("errorBox");
  const successBox = document.getElementById("successBox");
  errorBox.style.display = "none";
  successBox.style.display = "none";
  errorBox.textContent = "";
  successBox.textContent = "";

  const errors = validateAllRows();
  if (errors.length) {
    errorBox.textContent = errors.join("\n");
    errorBox.style.display = "block";
    return;
  }

  const state = loadStateAdmin();
  const rowMap = new Map();
  document.querySelectorAll("#adminTable tbody tr").forEach((tr) => {
    const [acceptedInput, deliveredInput] = tr.querySelectorAll(
      'input[type="datetime-local"]'
    );
    rowMap.set(tr.dataset.id, {
      acceptedISO: acceptedInput.value,
      deliveredISO: deliveredInput.value,
    });
  });

  state.meals.forEach((meal) => {
    if (!rowMap.has(meal.id)) return; // not shown on page

    const { acceptedISO, deliveredISO } = rowMap.get(meal.id);

    // Apply the clearing rule
    const acceptedLocale = acceptedISO
      ? toLocaleStringFromInputValue(acceptedISO)
      : "";
    const deliveredLocale = acceptedISO
      ? deliveredISO
        ? toLocaleStringFromInputValue(deliveredISO)
        : ""
      : ""; // accepted empty ⇒ delivered cleared

    // Update storage using your existing schema/format
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

  successBox.textContent =
    "All changes saved. Main page will refresh automatically.";
  successBox.style.display = "block";
}

// -------- Init --------
document.addEventListener("DOMContentLoaded", () => {
  renderTable();

  document
    .getElementById("bulkSaveBtn")
    .addEventListener("click", handleBulkSave);
  document.getElementById("reloadBtn").addEventListener("click", renderTable);
});

// Soft-refresh when Admin updates localStorage from another tab/page
window.addEventListener("storage", (e) => {
  if (e.key === "deliveryAppState" || e.key === "adminTriggerRefresh") {
    // Reload UI from saved state without a hard page reload
    loadState();
  }
});
