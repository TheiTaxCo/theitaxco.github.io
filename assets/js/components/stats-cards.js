// ../assets/js/components/stats-cards.js
class ERStatsCards extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._disposers = [];
  }

  connectedCallback() {
    this.render();
    this.update();

    // Refresh when localStorage updates from any tab/page
    const onStorage = (e) => {
      if (e.key === "deliveryAppState") {
        this.update();
      }
    };
    window.addEventListener("storage", onStorage);
    this._disposers.push(() =>
      window.removeEventListener("storage", onStorage)
    );

    // Optional manual refresh hook:
    // document.dispatchEvent(new CustomEvent("stats:refresh"))
    const onCustomRefresh = () => this.update();
    document.addEventListener("stats:refresh", onCustomRefresh);
    this._disposers.push(() =>
      document.removeEventListener("stats:refresh", onCustomRefresh)
    );
  }

  disconnectedCallback() {
    this._disposers.forEach((fn) => fn());
    this._disposers = [];
  }

  // --- Core: read completed meals with courier info ---
  readMeals() {
    let meals = [];
    try {
      const s = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
      if (Array.isArray(s.meals)) meals = s.meals;
    } catch (_) {}

    // Completed = accepted & delivered
    return meals.filter(
      (m) =>
        m &&
        m.checked &&
        m.timestamp &&
        m.delivered &&
        String(m.delivered).trim() !== ""
    );
  }

  // Convert "Accepted on: 11/23/2025, 1:43:58 PM" → Date
  _parseAccepted(ts) {
    if (!ts) return null;
    const raw = String(ts).replace("Accepted on: ", "").trim();
    const d = new Date(raw);
    return isNaN(d) ? null : d;
  }

  _parseDelivered(ts) {
    if (!ts) return null;
    const d = new Date(ts);
    return isNaN(d) ? null : d;
  }

  // totalMs + count → "Xh Ym" or "None"
  _formatAverageDuration(totalMs, count) {
    if (!count || !isFinite(totalMs) || totalMs <= 0) return "None";

    const avgMs = totalMs / count;
    const totalMinutes = Math.round(avgMs / 60000);
    if (totalMinutes <= 0) return "<1m";

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(" ");
  }

  compute() {
    const meals = this.readMeals();

    let ghMs = 0,
      ghCount = 0;
    let ueMs = 0,
      ueCount = 0;
    let allMs = 0,
      allCount = 0;

    meals.forEach((m) => {
      const accepted = this._parseAccepted(m.timestamp);
      const delivered = this._parseDelivered(m.delivered);
      if (!accepted || !delivered) return;

      const diff = delivered - accepted;
      if (!isFinite(diff) || diff <= 0) return;

      const courier = m.courierName || m.courier || "";

      // Overall
      allMs += diff;
      allCount += 1;

      if (courier === "grubHub") {
        ghMs += diff;
        ghCount += 1;
      } else if (courier === "uberEats") {
        ueMs += diff;
        ueCount += 1;
      }
    });

    return {
      ghAvg: this._formatAverageDuration(ghMs, ghCount),
      ueAvg: this._formatAverageDuration(ueMs, ueCount),
      allAvg: this._formatAverageDuration(allMs, allCount),
    };
  }

  update() {
    const { ghAvg, ueAvg, allAvg } = this.compute();
    const root = this.shadowRoot;
    if (!root) return;

    const elGh = root.getElementById("avgTimeGh");
    const elUe = root.getElementById("avgTimeUe");
    const elAll = root.getElementById("avgTimeAll");

    if (elGh) elGh.textContent = ghAvg;
    if (elUe) elUe.textContent = ueAvg;
    if (elAll) elAll.textContent = allAvg;
  }

  render() {
    const style = `
        :host{display:block}
        .stats-wrap{
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:12px;
        }
        .stats-card{
          border:1px solid #d1d5db;
          background:#fff;
          border-radius:12px;
          padding:12px;
          box-shadow:0 2px 6px rgba(0,0,0,.08);
        }
        .stats-label{
          font-size:12px;
          color:#6b7280;
          margin-bottom:6px;
        }
        .stats-value{
          font-size:20px;
          font-weight:800;
          line-height:1.2;
          font-variant-numeric:tabular-nums;
        }
        .stats-sub{
          margin-top:6px;
          font-size:11px;
          color:#94a3b8;
        }
        @media (max-width: 420px){
          .stats-wrap{grid-template-columns:1fr}
        }
      `;
    const html = `
        <div class="stats-wrap">
          <div class="stats-card">
            <div class="stats-label">Avg Time / Delivery — Grubhub</div>
            <div class="stats-value" id="avgTimeGh">None</div>
            <div class="stats-sub">Completed Grubhub meals only</div>
          </div>
          <div class="stats-card">
            <div class="stats-label">Avg Time / Delivery — Uber Eats</div>
            <div class="stats-value" id="avgTimeUe">None</div>
            <div class="stats-sub">Completed Uber Eats meals only</div>
          </div>
          <div class="stats-card">
            <div class="stats-label">Avg Time / Delivery — Overall</div>
            <div class="stats-value" id="avgTimeAll">None</div>
            <div class="stats-sub">All completed meals</div>
          </div>
        </div>
      `;
    this.shadowRoot.innerHTML = `<style>${style}</style>${html}`;
  }
}

customElements.define("er-stats-cards", ERStatsCards);
