// assets/js/components/mobile-tabs.js
// Mobile pill-style segmented tabs with equal-width columns and sliding thumb.

class ERMobileTabs extends HTMLElement {
  static get observedAttributes() {
    return ["options", "value", "disabled"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
        <style>
          :host {
            --track: #e5e7eb;      /* track behind pills */
            --thumb: #ffffff;      /* active pill background */
            --text: #111827;       /* active text color */
            --muted: #6b7280;      /* inactive text color */
            --radius: 6px;
            --pad: 2px;
            --height: 35px;
            --speed: 170ms;
            display: block;
          }
          .wrap {
            position: relative;
            background: var(--track);
            border-radius: calc(var(--radius) + 4px);
            padding: var(--pad);
            display: grid;
            grid-auto-flow: column;
            grid-template-columns: repeat(var(--count, 2), 1fr); /* equal columns */
            gap: 8px;
            box-shadow: inset 0 1px 0 rgba(0,0,0,.04);
          }
          .thumb {
            position: absolute;
            top: var(--pad);
            left: var(--pad);
            height: var(--height);
            width: var(--w, 120px);
            transform: translateX(var(--x, 0px));
            background: var(--thumb);
            border-radius: var(--radius);
            transition: transform var(--speed) ease, width var(--speed) ease;
            box-shadow: 0 1.5px 4px rgba(16,24,40,.12);
            will-change: transform, width;
            z-index: 0;
            pointer-events: none;
          }
          ::slotted(button) {
            all: unset;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: var(--height);
            padding: 0 16px;
            border-radius: var(--radius);
            font-weight: 700;
            font-size: 15px;
            line-height: 1;
            cursor: pointer;
            color: var(--muted);
            position: relative;
            z-index: 1; /* above thumb */
          }
          ::slotted(button[aria-selected="true"]) { color: var(--text); }
          :host([disabled]) { opacity: .6; pointer-events: none; }
        </style>
        <div class="wrap" role="tablist" aria-label="Segmented tabs">
          <div class="thumb" aria-hidden="true"></div>
          <slot></slot>
        </div>
      `;
    this._wrap = this.shadowRoot.querySelector(".wrap");
    this._thumb = this.shadowRoot.querySelector(".thumb");
    this._btns = [];
    this._ro = null;
    this._value = null;
  }

  connectedCallback() {
    this._buildIfNeeded();
    this._cache();
    this._bind();
    this._wrap.style.setProperty("--count", String(this._btns.length)); // equal columns

    const initial =
      this.getAttribute("value") ||
      this._btns[0]?.dataset.value ||
      this._btns[0]?.textContent.trim();
    this.select(initial, true);
    this._layout();

    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this);
  }

  disconnectedCallback() {
    this._ro && this._ro.disconnect();
  }

  attributeChangedCallback(n, _o, v) {
    if (n === "options") {
      this._buildIfNeeded(true);
      this._cache();
      this._bind();
      this._wrap.style.setProperty("--count", String(this._btns.length));
      this.select(
        this.getAttribute("value") || this._btns[0]?.dataset.value,
        true
      );
      this._layout();
    }
    if (n === "value") this.select(v);
  }

  get value() {
    return this._value;
  }
  set value(v) {
    this.setAttribute("value", v);
  }

  _buildIfNeeded(force = false) {
    const hasChildren = this.children.length > 0 && !force;
    if (hasChildren && !force) return;
    const list = (this.getAttribute("options") || "Active,Completed")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.innerHTML = "";
    list.forEach((label, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.value = label;
      b.setAttribute("role", "tab");
      if (i === 0) b.setAttribute("aria-selected", "true");
      this.appendChild(b);
    });
  }

  _cache() {
    this._btns = [...this.querySelectorAll('button[role="tab"],button')];
  }

  _bind() {
    this._btns.forEach((btn) => {
      btn.onclick = () =>
        this.select(btn.dataset.value || btn.textContent.trim());
      btn.onkeydown = (e) => {
        const i = this._btns.indexOf(btn);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          this._btns[(i + 1) % this._btns.length].click();
          this._btns[(i + 1) % this._btns.length].focus();
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          this._btns[(i - 1 + this._btns.length) % this._btns.length].click();
          this._btns[(i - 1 + this._btns.length) % this._btns.length].focus();
        }
      };
    });
  }

  select(v, silent = false) {
    const btn =
      this._btns.find((b) => (b.dataset.value || b.textContent.trim()) === v) ||
      this._btns[0];
    this._btns.forEach((b) => b.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");
    this._value = btn.dataset.value || btn.textContent.trim();
    this._layout();
    if (!silent)
      this.dispatchEvent(
        new CustomEvent("change", {
          bubbles: true,
          detail: { value: this._value },
        })
      );
  }

  _layout() {
    if (!this._btns.length) return;
    const idx = this._btns.findIndex(
      (b) => b.getAttribute("aria-selected") === "true"
    );
    const rects = this._btns.map((b) => b.getBoundingClientRect());
    const x = rects[idx].left - rects[0].left;
    const w = rects[idx].width; // equal due to grid columns
    this._wrap.style.setProperty("--x", x + "px");
    this._wrap.style.setProperty("--w", w + "px");
  }
}

customElements.define("er-mobile-tabs", ERMobileTabs);
