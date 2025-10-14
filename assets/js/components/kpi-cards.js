// ../assets/js/components/kpi-cards.js
class ERKpiCards extends HTMLElement {
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
      if (e.key === "deliveryAppState" || e.key === "earningsSummary") {
        this.update();
      }
    };
    window.addEventListener("storage", onStorage);
    this._disposers.push(() =>
      window.removeEventListener("storage", onStorage)
    );

    // Allow app-wide manual refresh: document.dispatchEvent(new CustomEvent('kpi:refresh'))
    const onCustomRefresh = () => this.update();
    document.addEventListener("kpi:refresh", onCustomRefresh);
    this._disposers.push(() =>
      document.removeEventListener("kpi:refresh", onCustomRefresh)
    );

    // Listen to odometer fields if present on the page
    this._attachOdometerListeners();

    // If inputs are rendered later, catch them
    this._observer = new MutationObserver(() =>
      this._attachOdometerListeners()
    );
    this._observer.observe(document.body, { childList: true, subtree: true });
  }

  disconnectedCallback() {
    this._disposers.forEach((fn) => fn());
    this._disposers = [];
    if (this._observer) this._observer.disconnect();
  }

  _attachOdometerListeners() {
    const ids = ["odoStart", "odoEnd"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.kpiBound) {
        el.addEventListener("blur", () => this.update());
        el.dataset.kpiBound = "1";
      }
    });
  }

  /* ====== READ STATE (excludes adjustments from earnings) ====== */
  readState() {
    // Meals & odometer
    let meals = [];
    let odoStart = null;
    let odoEnd = null;

    try {
      const s = JSON.parse(localStorage.getItem("deliveryAppState") || "{}");
      if (Array.isArray(s.meals)) meals = s.meals;
      if (s?.odometerStart !== undefined)
        odoStart = parseFloat(s.odometerStart);
      if (s?.odometerEnd !== undefined) odoEnd = parseFloat(s.odometerEnd);
    } catch (_) {}

    // Earnings: deliveryPay + tips only (NO adjustmentPay)
    const num = (v) => (v == null || v === "" ? 0 : parseFloat(v)) || 0;
    let earnings = 0;
    try {
      const es = JSON.parse(localStorage.getItem("earningsSummary") || "{}");
      const gh = es.grubhub || {};
      const ue = es.uberEats || es.ubereats || {};

      const ghEarnings = num(gh.deliveryPay) + num(gh.tips); // exclude gh.adjustmentPay
      const ueEarnings = num(ue.deliveryPay) + num(ue.tips); // exclude ue.adjustmentPay

      earnings = ghEarnings + ueEarnings;
      if (!isFinite(earnings)) earnings = 0;
    } catch (_) {}

    // Completed = accepted AND delivered
    const completedCount = meals.filter(
      (m) => !!m?.checked && !!(m?.delivered && String(m.delivered).trim())
    ).length;

    // Miles = odometerEnd - odometerStart if valid
    const miles =
      isFinite(odoStart) &&
      isFinite(odoEnd) &&
      !isNaN(odoStart) &&
      !isNaN(odoEnd) &&
      odoEnd > odoStart
        ? odoEnd - odoStart
        : 0;

    return { completedCount, earnings, miles };
  }

  compute() {
    const { completedCount, earnings, miles } = this.readState();

    // Average Order = earnings (no adjustments) / completed count
    const avgOrder = completedCount > 0 ? earnings / completedCount : 0;

    // Miles Per Order = total miles / completed count
    const milesPerOrder =
      completedCount > 0 && miles > 0 ? miles / completedCount : 0;

    // Pay Per Mile = earnings (no adjustments) / total miles
    const payPerMile = miles > 0 ? earnings / miles : 0;

    return {
      avgOrder: this._formatCurrency(avgOrder, 2),
      milesPerOrder: this._formatNumber(milesPerOrder, 1),
      payPerMile: this._formatCurrency(payPerMile, 2),
    };
  }

  update() {
    const { avgOrder, milesPerOrder, payPerMile } = this.compute();
    const root = this.shadowRoot;
    if (!root) return;

    const elAvg = root.getElementById("avgOrderVal");
    const elMpo = root.getElementById("milesPerOrderVal");
    const elPpm = root.getElementById("payPerMileVal");

    if (elAvg) elAvg.textContent = avgOrder; // $0.00 (2dp)
    if (elMpo) elMpo.textContent = milesPerOrder; // 0.0   (1dp)
    if (elPpm) elPpm.textContent = payPerMile; // $0.00 (2dp)
  }

  _formatCurrency(n, frac = 2) {
    const v = Number(n);
    if (!isFinite(v)) return "$0.00";
    return `$${v.toFixed(frac)}`;
  }
  _formatNumber(n, frac = 1) {
    const v = Number(n);
    if (!isFinite(v)) return frac === 1 ? "0.0" : "0";
    return v.toFixed(frac);
  }

  render() {
    const style = `
      :host{display:block}
      .kpi-wrap{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .kpi-card{
        border:1px solid #d1d5db;background:#fff;border-radius:12px;padding:12px;
        box-shadow:0 2px 6px rgba(0,0,0,.08)
      }
      .kpi-label{font-size:12px;color:#6b7280;margin-bottom:8px}
      .kpi-value{font-size:20px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums}
      .kpi-sub{margin-top:6px;font-size:11px;color:#94a3b8}
      @media (max-width: 420px){ .kpi-wrap{grid-template-columns:1fr} }
    `;
    const html = `
      <div class="kpi-wrap">
        <div class="kpi-card">
          <div class="kpi-label">Average Order</div>
          <div class="kpi-value" id="avgOrderVal">$0.00</div>
          <div class="kpi-sub">Total earnings ÷ completed count</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Miles Per Order</div>
          <div class="kpi-value" id="milesPerOrderVal">0.0</div>
          <div class="kpi-sub">Total miles ÷ completed count</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pay Per Mile</div>
          <div class="kpi-value" id="payPerMileVal">$0.00</div>
          <div class="kpi-sub">Total earnings ÷ total miles</div>
        </div>
      </div>
    `;
    this.shadowRoot.innerHTML = `<style>${style}</style>${html}`;
  }
}

customElements.define("er-kpi-cards", ERKpiCards);
