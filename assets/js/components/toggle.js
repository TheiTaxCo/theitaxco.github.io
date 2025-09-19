// assets/js/components/toggle.js
// Lightweight iOS-style toggle web component: <er-toggle label="Enable" checked></er-toggle>
class ERToggle extends HTMLElement {
  static get observedAttributes() {
    return ["checked", "disabled", "label"];
  }

  constructor() {
    super();
    this._checked = this.hasAttribute("checked");
    this._disabled = this.hasAttribute("disabled");
    this.attachShadow({ mode: "open" });

    this.shadowRoot.innerHTML = `
        <style>
          :host { display: inline-flex; align-items: center; font: inherit; }
          .toggle { display:inline-flex; align-items:center; gap:10px; user-select:none; }
          .label { line-height:1.2; }
          .visually-hidden { position:absolute; width:1px; height:1px; margin:-1px; border:0; padding:0; clip:rect(0 0 0 0); overflow:hidden; }
  
          /* iOS switch */
          .switch {
            position: relative;
            width: 52px;
            height: 32px;
            background: #E5E7EB;
            border-radius: 999px;
            transition: background-color 180ms ease;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
            flex-shrink: 0;
          }
          .thumb {
            position: absolute;
            top: 3px; left: 3px;
            width: 26px; height: 26px;
            background: #fff;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,.2), 0 1px 1px rgba(0,0,0,.1);
            transition: transform 180ms ease;
          }
          :host([checked]) .switch { background: #34C759; }
          :host([checked]) .thumb { transform: translateX(20px); }
  
          :host([disabled]) { opacity:.6; pointer-events:none; }
          .focus-ring { outline: none; box-shadow: 0 0 0 3px rgba(52,199,89,.35); border-radius: 999px; }
        </style>
  
        <label class="toggle">
          <span class="label"></span>
          <input class="visually-hidden" type="checkbox" />
          <span class="switch" aria-hidden="true"><span class="thumb"></span></span>
        </label>
      `;

    this._input = this.shadowRoot.querySelector("input");
    this._labelEl = this.shadowRoot.querySelector(".label");
    this._switch = this.shadowRoot.querySelector(".switch");

    // init
    this._input.checked = this._checked;
    this._input.disabled = this._disabled;
    this._labelEl.textContent = this.getAttribute("label") ?? "";

    // events
    this._switch.addEventListener("click", () => this.toggle());
    this._input.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.toggle();
      }
    });
    this._input.addEventListener("focus", () =>
      this._switch.classList.add("focus-ring")
    );
    this._input.addEventListener("blur", () =>
      this._switch.classList.remove("focus-ring")
    );
  }

  attributeChangedCallback(name, _old, value) {
    if (name === "checked") {
      const on = value !== null;
      this._input.checked = on;
    }
    if (name === "disabled") {
      const off = value !== null;
      this._input.disabled = off;
    }
    if (name === "label") {
      this._labelEl.textContent = value ?? "";
    }
  }

  // Public API
  get checked() {
    return this.hasAttribute("checked");
  }
  set checked(val) {
    val ? this.setAttribute("checked", "") : this.removeAttribute("checked");
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(val) {
    val ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
  }

  toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    // emit a change event with detail { checked: boolean }
    this.dispatchEvent(
      new CustomEvent("change", {
        bubbles: true,
        detail: { checked: this.checked },
      })
    );
  }
}
customElements.define("er-toggle", ERToggle);
