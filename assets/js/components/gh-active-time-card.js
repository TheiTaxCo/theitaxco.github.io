// EarnRoute — Active Time Card (Grubhub) with date-range support
// Usage:
//   <er-gh-active-time
//      title="Active Time — Grubhub"
//      date="YYYY-MM-DD"                // OPTIONAL single day
//      date-start="YYYY-MM-DD"          // OPTIONAL range start (inclusive)
//      date-end="YYYY-MM-DD"            // OPTIONAL range end   (inclusive)
//   ></er-gh-active-time>
//
// Data source: localStorage["deliveryAppState"].meals
// Calculation: sum(Delivered - Accepted) for Grubhub meals WITH delivered timestamp,
//              filtered by delivered LOCAL date (single day or inclusive range).

class ERGhActiveTime extends HTMLElement {
  static get observedAttributes() {
    return ["date", "date-start", "date-end", "title"];
  }

  constructor() {
    super();
    this._date = null; // YYYY-MM-DD (single-day mode)
    this._dateStart = null; // YYYY-MM-DD (range mode)
    this._dateEnd = null; // YYYY-MM-DD (range mode)
    this._title = "Active Time — Grubhub";
    this._onUpdate = this._onUpdate.bind(this);
  }

  connectedCallback() {
    if (this.hasAttribute("title"))
      this._title = this.getAttribute("title") || this._title;
    // ensure host stretches to container; keeps your width/look
    this.style.display = this.style.display || "block";
    this.style.width = this.style.width || "100%";
    this.style.maxWidth = this.style.maxWidth || "100%";

    this.render();
    window.addEventListener("er:deliveries:updated", this._onUpdate);
    window.addEventListener("storage", this._onUpdate);
  }

  disconnectedCallback() {
    window.removeEventListener("er:deliveries:updated", this._onUpdate);
    window.removeEventListener("storage", this._onUpdate);
  }

  attributeChangedCallback(name, _old, val) {
    if (name === "title") {
      this._title = val || "Active Time — Grubhub";
    } else if (name === "date") {
      this._date = val || null;
    } else if (name === "date-start") {
      this._dateStart = val || null;
    } else if (name === "date-end") {
      this._dateEnd = val || null;
    }
    this.render();
  }

  _onUpdate() {
    this.render();
  }

  _todayYMD() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  _fmtHMS(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "00:00:00";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const z = (n) => String(n).padStart(2, "0");
    return `${z(h)}:${z(m)}:${z(s)}`;
  }

  _toLocalYMD(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return null;
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  _parseAccepted(raw) {
    if (!raw) return NaN;
    const val = String(raw)
      .replace(/^Accepted on:\s*/i, "")
      .trim();
    const t = new Date(val).getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  _meals() {
    const state = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
    return Array.isArray(state?.meals) ? state.meals : [];
  }

  _latestDeliveredDateYMD() {
    const meals = this._meals();
    let latest = null;
    for (const m of meals) {
      if ((m.courierName || "").toLowerCase() !== "grubhub") continue;
      if (!m.delivered) continue;
      const d = new Date(m.delivered);
      if (isNaN(d)) continue;
      if (!latest || d > latest) latest = d;
    }
    return latest ? this._toLocalYMD(latest) : this._todayYMD();
  }

  _totalActiveMsForDay(ymd) {
    const meals = this._meals();
    let total = 0;
    for (const m of meals) {
      const courier = (m.courierName || "").toLowerCase();
      if (courier !== "grubhub") continue;

      const delivered = m.delivered ? new Date(m.delivered) : null;
      if (!delivered || isNaN(delivered)) continue;
      const k = this._toLocalYMD(delivered);
      if (k !== ymd) continue;

      const acceptedMs = this._parseAccepted(m.timestamp);
      const deliveredMs = delivered.getTime();
      const diff = deliveredMs - acceptedMs;
      if (Number.isFinite(diff) && diff > 0) total += diff;
    }
    return total;
  }

  _totalActiveMsForRange(startYMD, endYMD) {
    const meals = this._meals();
    let total = 0;
    for (const m of meals) {
      const courier = (m.courierName || "").toLowerCase();
      if (courier !== "grubhub") continue;

      const delivered = m.delivered ? new Date(m.delivered) : null;
      if (!delivered || isNaN(delivered)) continue;
      const k = this._toLocalYMD(delivered);
      if (!k || k < startYMD || k > endYMD) continue; // inclusive

      const acceptedMs = this._parseAccepted(m.timestamp);
      const deliveredMs = delivered.getTime();
      const diff = deliveredMs - acceptedMs;
      if (Number.isFinite(diff) && diff > 0) total += diff;
    }
    return total;
  }

  _readableDate(ymd) {
    const [y, m, d] = (ymd || "").split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return isNaN(dt)
      ? ymd
      : dt.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  }

  render() {
    // Determine mode: range vs single day
    const hasRange = !!(
      this._dateStart ||
      this.hasAttribute("date-start") ||
      this._dateEnd ||
      this.hasAttribute("date-end")
    );
    let label = "";
    let totalMs = 0;

    if (hasRange) {
      let startYMD = this._dateStart || this.getAttribute("date-start");
      let endYMD = this._dateEnd || this.getAttribute("date-end");
      const today = this._todayYMD();
      if (!startYMD) startYMD = today;
      if (!endYMD) endYMD = today;
      if (startYMD > endYMD) {
        const t = startYMD;
        startYMD = endYMD;
        endYMD = t;
      }

      totalMs = this._totalActiveMsForRange(startYMD, endYMD);

      // Build compact range label
      const s = new Date(startYMD + "T00:00:00");
      const e = new Date(endYMD + "T00:00:00");
      if (!isNaN(s) && !isNaN(e)) {
        if (startYMD === endYMD) {
          label = this._readableDate(startYMD);
        } else if (s.getFullYear() === e.getFullYear()) {
          if (s.getMonth() === e.getMonth()) {
            // Sep 22–24, 2025
            label = `${s.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}–${e.toLocaleDateString(undefined, {
              day: "numeric",
              year: "numeric",
            })}`;
          } else {
            // Sep 22 – Oct 2, 2025
            label = `${s.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })} – ${e.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`;
          }
        } else {
          // Dec 30, 2025 – Jan 2, 2026
          label = `${s.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })} – ${e.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`;
        }
      } else {
        label = `${startYMD} – ${endYMD}`;
      }
    } else {
      const ymd =
        this._date ||
        this.getAttribute("date") ||
        this._latestDeliveredDateYMD();
      totalMs = this._totalActiveMsForDay(ymd);
      label = this._readableDate(ymd);
    }

    const hms = this._fmtHMS(totalMs);

    this.innerHTML = `
      <section class="card er-gh-active-time">
        <h3>${this._title}</h3>
        <div class="row" style="margin-top: 8px;">
          <div class="pill gray">${label}</div>
        </div>
        <div class="row" style="margin-top: 12px;">
          <div><strong>Total Active Time</strong></div>
          <div style="font-weight:700;font-size:1.6rem;letter-spacing:.3px">${hms}</div>
        </div>
      </section>
    `;
  }
}

customElements.define("er-gh-active-time", ERGhActiveTime);
