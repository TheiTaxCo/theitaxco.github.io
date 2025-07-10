const MAX_MEALS = 25;

function formatNow() {
  return new Date().toLocaleString();
}

function saveState() {
  const state = {
    meals: [],
    startTime: document.getElementById("startTime").textContent,
    endTime: document.getElementById("endTime").textContent,
    odometerStart: document.getElementById("odoStart").value,
    odometerEnd: document.getElementById("odoEnd").value,
  };
  document.querySelectorAll(".task-checkbox").forEach((cb) => {
    const row = cb.closest(".checkbox-row");
    state.meals.push({
      label: cb.dataset.label,
      checked: cb.checked,
      timestamp: row.querySelector(".timestamp").textContent,
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
      addMeal(meal.label, meal.checked, meal.timestamp)
    );
  } else {
    addMeal("1st Meal");
  }
}

function addMeal(label = null, isChecked = false, timestampValue = "") {
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

  checkbox.addEventListener("click", () => {
    timestamp.textContent = checkbox.checked
      ? "Accepted on: " + formatNow()
      : "";
    removeBtn.style.display =
      !checkbox.checked && !timestamp.textContent && count > 0
        ? "inline"
        : "none";
    saveState();
  });

  left.appendChild(checkbox);
  left.appendChild(labelSpan);
  left.appendChild(timestamp);

  row.appendChild(left);
  row.appendChild(removeBtn);
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
  addMeal("1st Meal");
}

function computeSummary() {
  const startText = document.getElementById("startTime").textContent;
  const endText = document.getElementById("endTime").textContent;
  const odoStart = parseFloat(document.getElementById("odoStart").value);
  const odoEnd = parseFloat(document.getElementById("odoEnd").value);
  const summary = document.getElementById("summarySection");

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

  // ✅ Mobile zoom-reset logic with proper input focus detection
  let isFocusingInput = false;

  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("focus", () => {
      isFocusingInput = true;
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        const active = document.activeElement;
        const isStillInInput =
          active && active.tagName === "INPUT" && active.type === "number";

        if (!isStillInInput) {
          isFocusingInput = false;
        }

        if (!isFocusingInput && !isStillInInput) {
          if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
            const scrollY = window.scrollY;
            window.scrollTo(0, scrollY + 1);
            window.scrollTo(0, scrollY);
          }
        }
      }, 200);
    });
  });
});
