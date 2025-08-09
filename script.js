const MAX_MEALS = 25;
let activeMealElements = null;

function formatNow() {
  return new Date().toLocaleString();
}

function formatForExport(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatDuration(start, end) {
  const diff = end - start;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  return `${hrs} hour${hrs !== 1 ? "s" : ""} ${mins} minute${
    mins !== 1 ? "s" : ""
  }`;
}

function saveState() {
  const state = {
    meals: [],
    startTime: document.getElementById("startTime").textContent,
    endTime: document.getElementById("endTime").textContent,
    odometerStart: document.getElementById("odoStart").value,
    odometerEnd: document.getElementById("odoEnd").value,
  };

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

  localStorage.setItem("deliveryAppState", JSON.stringify(state));
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem("deliveryAppState"));
  if (saved) {
    document.getElementById("startTime").textContent = saved.startTime || "";
    document.getElementById("endTime").textContent = saved.endTime || "";
    document.getElementById("odoStart").value = saved.odometerStart || "";
    document.getElementById("odoEnd").value = saved.odometerEnd || "";
    document.getElementById("checkboxGroup").innerHTML = "";
    saved.meals.forEach((meal) =>
      addMeal(
        meal.label,
        meal.checked,
        meal.timestamp,
        meal.delivered,
        meal.duration
      )
    );
  } else {
    addMeal("1st Meal");
  }
}

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
    } else {
      duration = formatDuration(acceptedDate, new Date()); // Accepted → NOW
    }

    document.getElementById("slideUpSheet").classList.remove("hidden");
    document.getElementById("mealLabelInSheet").textContent = mealLabel;
    document.getElementById("acceptedTimeInSheet").textContent =
      timestamp.textContent;
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
  localStorage.removeItem("deliveryAppState");
  document.getElementById("startTime").textContent = "";
  document.getElementById("endTime").textContent = "";
  document.getElementById("odoStart").value = "";
  document.getElementById("odoEnd").value = "";
  document.getElementById("summarySection").style.display = "none";
  document.getElementById("checkboxGroup").innerHTML = "";
  document.getElementById("earningsControls").style.display = "none";
  addMeal("1st Meal");
}

function computeSummary() {
  const startText = document.getElementById("startTime").textContent;
  const endText = document.getElementById("endTime").textContent;
  const odoStart = parseFloat(document.getElementById("odoStart").value);
  const odoEnd = parseFloat(document.getElementById("odoEnd").value);
  const summary = document.getElementById("summarySection");

  document.getElementById("earningsControls").style.display = "flex";

  let onlineText = "Pending";
  if (startText) {
    const startTime = new Date(startText);
    const endTime = endText ? new Date(endText) : new Date();
    const diffMs = endTime - startTime;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMin = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    onlineText = `${diffHrs} hour${diffHrs !== 1 ? "s" : ""} ${diffMin} minute${
      diffMin !== 1 ? "s" : ""
    }`;
  }

  const totalDeliveries = document.querySelectorAll(
    ".task-checkbox:checked"
  ).length;

  let mileageText = "Pending";
  if (!isNaN(odoStart) && !isNaN(odoEnd) && odoEnd > odoStart) {
    mileageText = `${(odoEnd - odoStart).toFixed(1)} Miles`;
  }

  document.getElementById(
    "summaryOnline"
  ).textContent = `• Total Online: ${onlineText}`;
  document.getElementById(
    "summaryDeliveries"
  ).textContent = `• Total Deliveries: ${totalDeliveries} Deliveries`;
  document.getElementById(
    "summaryMileage"
  ).textContent = `• Total Mileage: ${mileageText}`;
  summary.style.display = "block";
}

function copyText1() {
  const now = new Date();
  const hour = now.getHours();
  let message = "Thank you for your support and generous tip!";

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
    showToast("Message copied to clipboard!");
  });
}

function showToast(msg) {
  const toast = document.getElementById("customToast");
  toast.textContent = msg;
  toast.className = "show-toast";
  setTimeout(() => {
    toast.className = toast.className.replace("show-toast", "");
  }, 3000);
}

window.addEventListener("DOMContentLoaded", () => {
  loadState();

  document.getElementById("startBtn").onclick = () => {
    document.getElementById("startTime").textContent = formatNow();
    saveState();
  };

  document.getElementById("endBtn").onclick = () => {
    document.getElementById("endTime").textContent = formatNow();
    saveState();
  };

  document.getElementById("odoStart").oninput = saveState;
  document.getElementById("odoEnd").oninput = saveState;

  document.getElementById("addMealBtn").onclick = () => addMeal();
  document.getElementById("resetBtn").onclick = resetAll;
  document.getElementById("computeBtn").onclick = computeSummary;

  document.getElementById("closeSheetBtn").onclick = () => {
    document.getElementById("slideUpSheet").classList.add("hidden");
  };

  // EXPORT JSON (Fix #1: define `state`)
  document.getElementById("exportJsonBtn").onclick = () => {
    const state = JSON.parse(localStorage.getItem("deliveryAppState")) || {};

    const formattedMeals = (state.meals || []).map((meal) => ({
      label: meal.label,
      checked: meal.checked,
      timestamp: formatForExport(meal.timestamp),
      delivered: formatForExport(meal.delivered),
      duration: meal.duration || "",
    }));

    const formattedEarnings = {};
    if (state.earnings) {
      formattedEarnings.deliveryPay = parseFloat(
        state.earnings.deliveryPay || 0
      ).toFixed(2);
      formattedEarnings.tips = parseFloat(state.earnings.tips || 0).toFixed(2);
      formattedEarnings.adjustment = parseFloat(
        state.earnings.adjustment || 0
      ).toFixed(2);
      formattedEarnings.total = parseFloat(state.earnings.total || 0).toFixed(
        2
      );
    }

    const summary = {
      totalOnline: document
        .getElementById("summaryOnline")
        .textContent.replace("• Total Online: ", ""),
      totalDeliveries: document
        .getElementById("summaryDeliveries")
        .textContent.replace("• Total Deliveries: ", ""),
      totalMileage: document
        .getElementById("summaryMileage")
        .textContent.replace("• Total Mileage: ", ""),
    };

    const exportData = {
      startTime: formatForExport(state.startTime),
      endTime: formatForExport(state.endTime),
      odometerStart: state.odometerStart || "",
      odometerEnd: state.odometerEnd || "",
      meals: formattedMeals,
      earnings: formattedEarnings,
      summary,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Show Earnings Sheet (prefill from earningsSummary)
  document.getElementById("openEarningsBtn").onclick = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("earningsSummary")) || {};
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
    } catch (_) {
      // ignore prefill errors
    }

    document.getElementById("earningsSheet").classList.remove("hidden");
  };

  // Calculate + save earningsSummary
  document
    .getElementById("calcEarningsBtn")
    .addEventListener("click", function () {
      const ghDelivery =
        parseFloat(document.getElementById("deliveryPayGrubhub").value) || 0;
      const ghTips =
        parseFloat(document.getElementById("tipsPayGrubhub").value) || 0;
      const ghAdjust =
        parseFloat(document.getElementById("adjustmentPayGrubhub").value) || 0;

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
    });
}); // <-- Fix #2: close DOMContentLoaded wrapper

// Save the state before the page is unloaded
window.addEventListener("beforeunload", saveState);

// Hide earnings sheet when "×" close button is clicked
document
  .getElementById("closeEarningsBtn")
  .addEventListener("click", function () {
    document.getElementById("earningsSheet").classList.add("hidden");
  });

document.getElementById("markDeliveredBtn").onclick = () => {
  if (!activeMealElements) return;

  const deliveredNow = new Date();
  const deliveredStr = deliveredNow.toLocaleString();
  const acceptedStr = activeMealElements.timestamp.textContent.replace(
    "Accepted on: ",
    ""
  );
  const acceptedDate = new Date(acceptedStr);
  const durationStr = formatDuration(acceptedDate, deliveredNow);

  document.getElementById("deliveredTimeInSheet").textContent = deliveredStr;
  document.getElementById("durationInSheet").textContent = durationStr;
  document.getElementById("markDeliveredBtn").disabled = true;

  activeMealElements.row.dataset.delivered = deliveredStr;
  activeMealElements.row.dataset.duration = durationStr;
  activeMealElements.checkbox.disabled = true;

  saveState();
};
