// -------- Time Clock Settings (standalone component) --------

// Local helpers copied from admin.js for consistent time formatting
function toInputValueFromLocaleString(localeStr) {
  // localeStr like "8/12/2025, 10:15:32 PM" or "" → "YYYY-MM-DDTHH:MM:SS"
  if (!localeStr) return "";
  const d = new Date(localeStr);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

function toLocaleStringFromInputValue(inputVal) {
  // inputVal like "2025-08-12T22:11:33" → local string
  if (!inputVal) return "";
  const d = new Date(inputVal);
  if (isNaN(d)) return "";
  return d.toLocaleString();
}

// Safely pull current deliveryAppState from localStorage
function loadTimeState() {
  try {
    const raw = localStorage.getItem("deliveryAppState") || "{}";
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.error("Failed to parse deliveryAppState:", e);
    return {};
  }
}

// Persist back to localStorage (non-destructive for other fields)
function saveTimeState(next) {
  const prev = loadTimeState();
  const state = Object.assign({}, prev, {
    startTime: next.startTime || "",
    endTime: next.endTime || "",
  });
  localStorage.setItem("deliveryAppState", JSON.stringify(state));

  // Signal Home/admin pages to soft-refresh
  localStorage.setItem("adminTriggerRefresh", String(Date.now()));
}

// Wrapper around global formatDuration from script.js, with a fallback
function safeFormatDuration(startDate, endDate) {
  if (typeof formatDuration === "function") {
    return formatDuration(startDate, endDate);
  }
  const diff = endDate - startDate;
  if (!isFinite(diff) || diff < 0) return "Pending";
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return (
    hrs +
    " hour" +
    (hrs !== 1 ? "s " : " ") +
    mins +
    " minute" +
    (mins !== 1 ? "s" : "")
  );
}

function updateDurationPreview() {
  const pill = document.getElementById("durationPreviewPill");
  const startInput = document.getElementById("timeStartInput");
  const endInput = document.getElementById("timeEndInput");
  if (!pill || !startInput || !endInput) return;

  const sVal = startInput.value;
  const eVal = endInput.value;

  if (!sVal && !eVal) {
    pill.textContent = "Duration preview: Pending";
    return;
  }

  if (!sVal) {
    pill.textContent = "Duration preview: Start time required";
    return;
  }

  const start = new Date(sVal);
  const end = eVal ? new Date(eVal) : new Date();

  if (isNaN(start) || isNaN(end)) {
    pill.textContent = "Duration preview: Invalid date/time";
    return;
  }

  const label = safeFormatDuration(start, end);
  pill.textContent = "Duration preview: " + label;
}

function loadInputsFromState() {
  const state = loadTimeState();
  const startInput = document.getElementById("timeStartInput");
  const endInput = document.getElementById("timeEndInput");
  if (!startInput || !endInput) return;

  startInput.value = toInputValueFromLocaleString(state.startTime || "");
  endInput.value = toInputValueFromLocaleString(state.endTime || "");
  updateDurationPreview();
}

function showInlineMessage(type, message) {
  const errorBox = document.getElementById("timeErrorBox");
  const successBox = document.getElementById("timeSuccessBox");
  if (errorBox) {
    errorBox.style.display = "none";
    errorBox.textContent = "";
  }
  if (successBox) {
    successBox.style.display = "none";
    successBox.textContent = "";
  }

  if (type === "error" && errorBox) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  } else if (type === "success" && successBox) {
    successBox.textContent = message;
    successBox.style.display = "block";
  }

  // Also use global toast if available for quick feedback
  if (typeof showToast === "function") {
    showToast(message);
  }
}

function saveTimeSettings() {
  const startInput = document.getElementById("timeStartInput");
  const endInput = document.getElementById("timeEndInput");
  if (!startInput || !endInput) return;

  const sVal = startInput.value;
  const eVal = endInput.value;

  // Validation: require start if end is set
  if (!sVal && eVal) {
    showInlineMessage(
      "error",
      "Start date/time is required when end time is set."
    );
    return;
  }

  // Validation: if both present, end >= start
  if (sVal && eVal) {
    const s = new Date(sVal);
    const e = new Date(eVal);
    if (isNaN(s) || isNaN(e) || e < s) {
      showInlineMessage(
        "error",
        "End date/time must be on or after the start date/time."
      );
      return;
    }
  }

  const next = loadTimeState();
  next.startTime = sVal ? toLocaleStringFromInputValue(sVal) : "";
  next.endTime = eVal ? toLocaleStringFromInputValue(eVal) : "";
  saveTimeState(next);
  updateDurationPreview();
  showInlineMessage("success", "Time Clock settings saved.");
}

window.addEventListener("DOMContentLoaded", function () {
  // Initial load
  loadInputsFromState();

  // Live preview on change
  const startInput = document.getElementById("timeStartInput");
  const endInput = document.getElementById("timeEndInput");
  if (startInput) startInput.addEventListener("input", updateDurationPreview);
  if (endInput) endInput.addEventListener("input", updateDurationPreview);

  // Save + Reload buttons
  const saveBtn = document.getElementById("saveTimeBtn");
  const reloadBtn = document.getElementById("reloadTimeBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveTimeSettings);
  if (reloadBtn) reloadBtn.addEventListener("click", loadInputsFromState);
});
