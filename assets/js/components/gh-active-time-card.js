// EarnRoute — Grubhub Active Time Card (Date-only pill)
// Usage: <er-gh-active-time date="YYYY-MM-DD" title="Active Time — Grubhub"></er-gh-active-time>
// If no `date` provided, defaults to today's local date. Uses deliveryAppState.meals from localStorage.

class ERGhActiveTime extends HTMLElement {
  static get observedAttributes() {
    return ["date", "title"];
  }

  constructor() {
    super();
    this._date = null; // YYYY-MM-DD
    this._title = "Active Time — Grubhub";
    this._onUpdate = this._onUpdate.bind(this);
  }

  connectedCallback() {
    if (!this._date) this._date = this._todayYMD();
    if (this.hasAttribute("title"))
      this._title = this.getAttribute("title") || this._title;
    this.style.display = "block";
    this.render();
    window.addEventListener("er:deliveries:updated", this._onUpdate);
    window.addEventListener("storage", this._onUpdate);
  }

  disconnectedCallback() {
    window.removeEventListener("er:deliveries:updated", this._onUpdate);
    window.removeEventListener("storage", this._onUpdate);
  }

  attributeChangedCallback(name, _old, val) {
    if (name === "date") {
      this._date = val ? String(val) : this._todayYMD();
      this.render();
    } else if (name === "title") {
      this._title = val || "Active Time — Grubhub";
      this.render();
    }
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

  _sameLocalDate(ts, ymd) {
    const d = new Date(ts);
    if (isNaN(d)) return false;
    const z = (n) => String(n).padStart(2, "0");
    const got = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    return got === ymd;
  }

  _parseAccepted(raw) {
    // Example: "Accepted on: 9/27/2025, 4:26:24 PM"
    if (!raw) return NaN;
    const val = String(raw)
      .replace(/^Accepted on:\s*/i, "")
      .trim();
    const t = new Date(val).getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  _totalActiveMsFor(ymd) {
    const state = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
    const meals = Array.isArray(state?.meals) ? state.meals : [];
    let total = 0;

    for (const m of meals) {
      const courier = (m.courierName || "").toLowerCase(); // e.g., "grubhub"
      if (courier !== "grubhub") continue;

      const delivered = m.delivered ? new Date(m.delivered) : null;
      if (!delivered || isNaN(delivered)) continue;
      if (!this._sameLocalDate(delivered, ymd)) continue;

      const acceptedMs = this._parseAccepted(m.timestamp);
      const deliveredMs = delivered.getTime();
      const diff = deliveredMs - acceptedMs;
      if (Number.isFinite(diff) && diff > 0) total += diff;
    }
    return total;
  }

  render() {
    const ymd = this._date || this._todayYMD();
    const totalMs = this._totalActiveMsFor(ymd);
    const hms = this._fmtHMS(totalMs);

    const readableDate = (() => {
      const [y, m, d] = ymd.split("-").map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return dt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    })();

    this.innerHTML = `
        <section class="card er-gh-active-time">
          <h3>${this._title}</h3>
          <div class="row" style="margin-top: 8px;">
            <div class="pill gray">${readableDate}</div>
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
