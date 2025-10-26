// EarnRoute — Active Time Card (Supabase-only, platform_id based)
// Table 'deliveries' columns: platform_id (int), accepted_at (timestamptz), delivered_at (timestamptz NULL)
// Maps courier -> platform_id (1=Grubhub, 2=Uber Eats) and sums overlap with selected local date range.

(function () {
  const TAG = "er-active-time";
  const TAG_COMPAT = "er-gh-active-time";

  if (customElements.get(TAG)) {
    console.info("[ActiveTime] <" + TAG + "> already defined; skipping.");
    return;
  }

  class ERActiveTime extends HTMLElement {
    static get observedAttributes() {
      return ["title", "courier", "date-start", "date-end", "date"];
    }

    constructor() {
      super();
      this._title = "Active Time";
      this._courier = "grubhub";
      this._dateStart = null;
      this._dateEnd = null;
      this._busy = false;
      this._mounted = false;
      this._onUpdate = this._onUpdate.bind(this);
      this._onSupabaseReady = this._onSupabaseReady.bind(this);
    }

    connectedCallback() {
      if (this.hasAttribute("title"))
        this._title = this.getAttribute("title") || this._title;
      if (this.hasAttribute("courier"))
        this._courier = (
          this.getAttribute("courier") || "grubhub"
        ).toLowerCase();
      this.style.display = "block";
      this.style.width = "100%";
      this._mounted = true;

      this.render(true);
      window.addEventListener("er:deliveries:updated", this._onUpdate);
      window.addEventListener("er:supabase:ready", this._onSupabaseReady);
    }

    disconnectedCallback() {
      this._mounted = false;
      window.removeEventListener("er:deliveries:updated", this._onUpdate);
      window.removeEventListener("er:supabase:ready", this._onSupabaseReady);
    }

    attributeChangedCallback(name, _old, val) {
      if (name === "title") this._title = val || "Active Time";
      if (name === "courier") this._courier = (val || "grubhub").toLowerCase();
      if (name === "date-start") this._dateStart = val || null;
      if (name === "date-end") this._dateEnd = val || null;
      if (name === "date" && val) {
        this._dateStart = val;
        this._dateEnd = val;
      }
      this.render(true);
    }

    _onUpdate() {
      this.render(true);
    }
    _onSupabaseReady() {
      this.render(true);
    }

    _todayYMD() {
      const d = new Date();
      const z = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    }

    _readableRangeLabel(startYMD, endYMD) {
      const s = new Date(startYMD + "T00:00:00");
      const e = new Date(endYMD + "T23:59:59.999");
      if (isNaN(s) || isNaN(e)) return `${startYMD} – ${endYMD}`;
      if (startYMD === endYMD)
        return s.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      if (s.getFullYear() === e.getFullYear()) {
        if (s.getMonth() === e.getMonth()) {
          return `${s.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}–${e.toLocaleDateString(undefined, {
            day: "numeric",
            year: "numeric",
          })}`;
        }
        return `${s.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })} – ${e.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`;
      }
      return `${s.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} – ${e.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
    }

    _rangeFromAttrs() {
      let startYMD = this._dateStart || this.getAttribute("date-start");
      let endYMD = this._dateEnd || this.getAttribute("date-end");
      const today = this._todayYMD();
      if (!startYMD && !endYMD) startYMD = endYMD = today;
      if (!startYMD) startYMD = endYMD;
      if (!endYMD) endYMD = startYMD;
      if (startYMD > endYMD) [startYMD, endYMD] = [endYMD, startYMD];
      const start = new Date(startYMD + "T00:00:00");
      const end = new Date(endYMD + "T23:59:59.999");
      return { startYMD, endYMD, start, end };
    }

    _overlapMs(aStart, aEnd, bStart, bEnd) {
      const s = aStart > bStart ? aStart : bStart;
      const e = aEnd < bEnd ? aEnd : bEnd;
      const ms = e - s;
      return ms > 0 ? ms : 0;
    }

    _platformIdFromCourier(courier) {
      const map = { grubhub: 1, "uber eats": 2, ubereats: 2, uber_eats: 2 };
      return map[(courier || "").toLowerCase()] ?? null;
    }

    async _fetchFromSupabase(platformId, start, end) {
      const supabase = window.supabase;
      if (!supabase || !supabase.from)
        throw new Error("Supabase not initialized");
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const { data, error } = await supabase
        .from("deliveries")
        .select("accepted_at, delivered_at, platform_id")
        .eq("platform_id", platformId)
        .lte("accepted_at", endIso)
        .or(`delivered_at.gte.${startIso},delivered_at.is.null`);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }

    async _computeTotalMs() {
      const { startYMD, endYMD, start, end } = this._rangeFromAttrs();
      const label = this._readableRangeLabel(startYMD, endYMD);
      const platformId = this._platformIdFromCourier(this._courier);
      if (!platformId)
        throw new Error(
          `Unknown courier → platform_id mapping: ${this._courier}`
        );

      const rows = await this._fetchFromSupabase(platformId, start, end);
      const now = new Date();
      let total = 0;
      for (const r of rows) {
        const a = r && r.accepted_at ? new Date(r.accepted_at) : null;
        const d = r && r.delivered_at ? new Date(r.delivered_at) : now;
        if (!a || isNaN(a) || isNaN(d)) continue;
        total += this._overlapMs(a, d, start, end);
      }
      return { totalMs: total, label, count: rows.length };
    }

    async render(asyncMode = false) {
      if (!this._mounted) return;

      if (!asyncMode || !this._busy) {
        this.innerHTML = `
          <section class="card er-active-time">
            <h3>${this._title}</h3>
            <div class="row" style="margin-top:8px;">
              <div class="pill gray">Calculating…</div>
            </div>
            <div class="row" style="margin-top:12px;">
              <div><strong>Total Active Time</strong></div>
              <div style="font-weight:700;font-size:1.6rem;letter-spacing:.3px">--:--:--</div>
            </div>
          </section>`;
      }
      if (this._busy && asyncMode) return;
      this._busy = true;

      try {
        const { totalMs, label, count } = await this._computeTotalMs();
        const hms = this._fmtHMS(totalMs);
        this.innerHTML = `
          <section class="card er-active-time">
            <h3>${this._title}</h3>
            <div class="row" style="margin-top:8px;">
              <div class="pill gray">${label} • ${count} row${
          count === 1 ? "" : "s"
        }</div>
            </div>
            <div class="row" style="margin-top:12px;">
              <div><strong>Total Active Time</strong></div>
              <div style="font-weight:700;font-size:1.6rem;letter-spacing:.3px">${hms}</div>
            </div>
          </section>`;
      } catch (e) {
        console.error("[ActiveTime] error:", e);
        let msg = "Error loading data";
        if (e?.message?.includes("Supabase not initialized"))
          msg = "Supabase not initialized";
        if (e?.message?.startsWith("Unknown courier")) msg = e.message;
        this.innerHTML = `
          <section class="card er-active-time">
            <h3>${this._title}</h3>
            <div class="row" style="margin-top:8px;">
              <div class="pill gray">${msg}</div>
            </div>
            <div class="row" style="margin-top:12px;">
              <div><strong>Total Active Time</strong></div>
              <div style="font-weight:700;font-size:1.6rem;letter-spacing:.3px">--:--:--</div>
            </div>
          </section>`;
      } finally {
        this._busy = false;
      }
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
  }

  customElements.define(TAG, ERActiveTime);

  if (!customElements.get(TAG_COMPAT)) {
    class ERGhActiveTime extends ERActiveTime {
      constructor() {
        super();
        this._courier = "grubhub";
        if (!this.hasAttribute("courier"))
          this.setAttribute("courier", "grubhub");
        if (!this.hasAttribute("title"))
          this.setAttribute("title", "Active Time — Grubhub");
      }
    }
    customElements.define(TAG_COMPAT, ERGhActiveTime);
  }
})();
