/**
 * Baseline Mascot: Dr. Bindu, a doctor character built from moving parts.
 *
 * Technical Concept: a rigged SVG character
 * Instead of swapping still pictures, one SVG has named parts (arms, eyes, brows, mouths, props).
 * A pose is a CSS class on the figure that shows, hides and moves those parts; CSS animates them.
 * She breathes and blinks when idle, her eyes follow your finger or mouse, her mouth moves while her
 * words type out, and she reacts to what happens (reading, thinking, celebrating, pointing).
 *
 * Rule: she only says what the API says, fixed lines from i18n.js, or error sentences. Never diagnoses.
 */

const Mascot = (() => {
  const POSES = ["wave", "smile", "pointing", "reading", "thinking", "calendar", "shrug", "celebrate"];
  const TYPE_MS = 16;          // per character while "talking"
  const RESTORE_AFTER_MS = 6000;

  let container = null;
  let figure = null;
  let visualText = null;
  let srText = null;
  let typingTimer = null;
  let restoreTimer = null;
  let lastEvaluated = null;    // { key, params, pose } so it can be redrawn in a new language
  let tapCount = 0;

  const reducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- The drawing ----------
  const SVG = `
<svg class="bindu" viewBox="0 0 120 124" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="bCoat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e2e8f0"/></linearGradient>
    <linearGradient id="bScrubs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d9488"/><stop offset="100%" stop-color="#0f766e"/></linearGradient>
  </defs>
  <g class="b-all">
    <g class="b-body">
      <path d="M 28 118 C 28 86 40 77 60 77 C 80 77 92 86 92 118 Z" fill="url(#bCoat)" stroke="#cbd5e1" stroke-width="2"/>
      <polygon points="50,77 70,77 60,95" fill="url(#bScrubs)"/>
      <path d="M 44 81 C 44 99 56 105 60 105 C 64 105 76 99 76 81" fill="none" stroke="#042f2e" stroke-width="3" stroke-linecap="round"/>
      <circle cx="60" cy="108" r="4.5" fill="#0d9488" stroke="#042f2e" stroke-width="2"/>
    </g>

    <!-- Props held in front of the body -->
    <g class="b-prop b-clipboard">
      <rect x="43" y="84" width="34" height="27" rx="3" fill="#b45309"/>
      <rect x="46" y="88" width="28" height="21" rx="1.5" fill="#ffffff"/>
      <rect x="54" y="82" width="12" height="5" rx="1.5" fill="#64748b"/>
      <line x1="49" y1="93" x2="71" y2="93" stroke="#94a3b8" stroke-width="1.6"/>
      <line x1="49" y1="98" x2="67" y2="98" stroke="#94a3b8" stroke-width="1.6"/>
      <line x1="49" y1="103" x2="70" y2="103" stroke="#94a3b8" stroke-width="1.6"/>
    </g>
    <g class="b-prop b-calendar">
      <rect x="44" y="84" width="32" height="27" rx="3" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
      <rect x="44" y="84" width="32" height="8" rx="3" fill="#dc2626"/>
      <text x="60" y="106" text-anchor="middle" font-size="12" font-weight="800" fill="#0f172a" font-family="Nunito, sans-serif">!</text>
    </g>

    <!-- Arms: one set per pose, shown by the pose class -->
    <g class="b-arms arms-rest">
      <path d="M 33 86 Q 23 97 25 115" class="b-sleeve"/><circle cx="25" cy="116" r="5" class="b-hand"/>
      <path d="M 87 86 Q 97 97 95 115" class="b-sleeve"/><circle cx="95" cy="116" r="5" class="b-hand"/>
    </g>
    <g class="b-arms arms-wave">
      <path d="M 33 86 Q 23 97 25 115" class="b-sleeve"/><circle cx="25" cy="116" r="5" class="b-hand"/>
      <g class="b-wave-arm">
        <path d="M 87 85 Q 101 71 101 53" class="b-sleeve"/><circle cx="101" cy="49" r="6" class="b-hand"/>
      </g>
    </g>
    <g class="b-arms arms-point">
      <path d="M 33 86 Q 23 97 25 115" class="b-sleeve"/><circle cx="25" cy="116" r="5" class="b-hand"/>
      <g class="b-point-arm">
        <path d="M 87 85 Q 103 81 110 70" class="b-sleeve"/><circle cx="112" cy="67" r="5.5" class="b-hand"/>
        <line x1="114" y1="64" x2="118" y2="59" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>
    <g class="b-arms arms-hold">
      <path d="M 33 86 Q 36 99 46 100" class="b-sleeve"/><circle cx="47" cy="100" r="5" class="b-hand"/>
      <path d="M 87 86 Q 84 99 74 100" class="b-sleeve"/><circle cx="73" cy="100" r="5" class="b-hand"/>
    </g>
    <g class="b-arms arms-chin">
      <path d="M 33 86 Q 23 97 25 115" class="b-sleeve"/><circle cx="25" cy="116" r="5" class="b-hand"/>
      <path d="M 87 86 Q 84 78 72 73" class="b-sleeve"/><circle cx="68" cy="71" r="5.5" class="b-hand"/>
    </g>
    <g class="b-arms arms-shrug">
      <path d="M 33 86 Q 19 89 15 79" class="b-sleeve"/><circle cx="13" cy="76" r="5.5" class="b-hand"/>
      <path d="M 87 86 Q 101 89 105 79" class="b-sleeve"/><circle cx="107" cy="76" r="5.5" class="b-hand"/>
    </g>
    <g class="b-arms arms-up">
      <path d="M 33 85 Q 21 69 19 51" class="b-sleeve"/><circle cx="18" cy="47" r="6" class="b-hand"/>
      <path d="M 87 85 Q 99 69 101 51" class="b-sleeve"/><circle cx="102" cy="47" r="6" class="b-hand"/>
    </g>

    <g class="b-head">
      <ellipse cx="60" cy="49" rx="24" ry="26" fill="#fcd34d"/>
      <path d="M 36 45 C 36 25 50 19 60 19 C 70 19 84 25 84 45 C 84 35 76 27 60 27 C 44 27 36 35 36 45 Z" fill="#1e293b"/>
      <ellipse cx="60" cy="17" rx="12" ry="7" fill="#1e293b"/>
      <ellipse cx="44" cy="57" rx="3.5" ry="2" fill="#f87171" opacity="0.6"/>
      <ellipse cx="76" cy="57" rx="3.5" ry="2" fill="#f87171" opacity="0.6"/>

      <!-- Eyes: the outer group follows your pointer, the inner one blinks and takes pose offsets -->
      <g class="b-look">
        <g class="b-eyes">
          <circle cx="51" cy="49" r="2.6" fill="#0f172a"/>
          <circle cx="69" cy="49" r="2.6" fill="#0f172a"/>
        </g>
      </g>
      <g class="b-happy-eyes">
        <path d="M 47 50 Q 51 45 55 50" fill="none" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M 65 50 Q 69 45 73 50" fill="none" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round"/>
      </g>
      <circle cx="51" cy="49" r="7.5" fill="none" stroke="#0d9488" stroke-width="2.5"/>
      <circle cx="69" cy="49" r="7.5" fill="none" stroke="#0d9488" stroke-width="2.5"/>
      <line x1="58.5" y1="49" x2="61.5" y2="49" stroke="#0d9488" stroke-width="2.5"/>

      <g class="b-brows">
        <path class="brow-l" d="M 45 38 Q 51 35 56 38" fill="none" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round"/>
        <path class="brow-r" d="M 64 38 Q 69 35 75 38" fill="none" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round"/>
      </g>

      <!-- Mouths: one shown per pose; "b-mouth-talk" flaps while she talks -->
      <path class="b-mouth m-smile" d="M 53 60 Q 60 66 67 60" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
      <path class="b-mouth m-soft" d="M 54 61 Q 60 63.5 66 61" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
      <path class="b-mouth m-grin" d="M 52 58.5 Q 60 69 68 58.5 Z" fill="#7f1d1d" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
      <circle class="b-mouth m-o" cx="60" cy="61.5" r="2.4" fill="#7f1d1d"/>
      <ellipse class="b-mouth-talk" cx="60" cy="61" rx="4.2" ry="3.2" fill="#7f1d1d"/>
    </g>

    <g class="b-dots">
      <circle cx="84" cy="22" r="2.4"/><circle cx="92" cy="15" r="3"/><circle cx="101" cy="9" r="3.6"/>
    </g>
  </g>
  <g class="b-confetti">
    <rect x="16" y="20" width="5" height="5" fill="#f59e0b"/><rect x="100" y="16" width="5" height="5" fill="#0d9488"/>
    <rect x="8" y="46" width="4" height="4" fill="#dc2626"/><rect x="108" y="40" width="4" height="4" fill="#6366f1"/>
    <circle cx="30" cy="10" r="2.5" fill="#22c55e"/><circle cx="88" cy="6" r="2.5" fill="#f43f5e"/>
  </g>
</svg>`;

  /** A fresh copy of the figure in a pose (also used on the landing and login pages). */
  function createFigure(pose = "wave") {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = SVG.trim();
    const svg = wrapper.firstElementChild;
    setPose(svg, pose);
    followPointer(svg);
    return svg;
  }

  function setPose(svg, pose) {
    POSES.forEach((p) => svg.classList.remove(`pose-${p}`));
    svg.classList.add(`pose-${POSES.includes(pose) ? pose : "wave"}`);
  }

  /** Eyes follow the mouse or finger, a couple of pixels at most. */
  function followPointer(svg) {
    if (reducedMotion()) return;
    const look = svg.querySelector(".b-look");
    document.addEventListener("pointermove", (e) => {
      const box = svg.getBoundingClientRect();
      if (!box.width) return;
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height * 0.4);
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 300) * 2.2;
      look.setAttribute("transform", `translate(${((dx / dist) * reach).toFixed(2)} ${((dy / dist) * reach).toFixed(2)})`);
    }, { passive: true });
  }

  /** Words appear letter by letter while the mouth moves; screen readers get the whole sentence once. */
  function speak(text) {
    clearInterval(typingTimer);
    srText.textContent = text;
    if (reducedMotion() || !text) {
      visualText.textContent = text;
      figure.classList.remove("talking");
      return;
    }
    let shown = 0;
    visualText.textContent = "";
    figure.classList.add("talking");
    typingTimer = setInterval(() => {
      shown = Math.min(text.length, shown + 2);
      visualText.textContent = text.slice(0, shown);
      if (shown >= text.length) {
        clearInterval(typingTimer);
        figure.classList.remove("talking");
      }
    }, TYPE_MS * 2);
  }

  function replay(el, className) {
    el.classList.remove(className);
    void el.getBoundingClientRect();   // restart the CSS animation
    el.classList.add(className);
  }

  function mountInto(el, pose) {
    if (!el) return null;
    const svg = createFigure(pose);
    // Keep the page's own sizing/animation classes (e.g. landing-mascot), not the old image class.
    svg.classList.add(...[...el.classList].filter((c) => c !== "mascot-avatar"));
    el.replaceWith(svg);
    return svg;
  }

  return {
    createFigure,

    /** Put a waving, blinking Dr. Bindu in place of a static <img> (landing and login pages). */
    decorate(img, pose = "wave") {
      return mountInto(img, pose);
    },

    init(el) {
      container = el || document.getElementById("mascot-container");
      if (!container) return;
      const wrapper = container.querySelector(".mascot-avatar-wrapper");
      const img = container.querySelector(".mascot-avatar");
      figure = mountInto(img, "wave");

      const bubble = container.querySelector(".mascot-bubble");
      bubble.textContent = "";
      visualText = document.createElement("span");
      visualText.setAttribute("aria-hidden", "true");
      srText = document.createElement("span");
      srText.className = "sr-only";
      bubble.append(visualText, srText);

      // Tap her: a bounce and a friendly line, then back to what she was saying.
      if (wrapper) {
        wrapper.setAttribute("role", "button");
        wrapper.setAttribute("tabindex", "0");
        wrapper.setAttribute("aria-label", t("common.mascotAlt"));
        const onTap = () => {
          replay(wrapper, "b-bounce");
          tapCount += 1;
          this.say(t(`mascot.tap${((tapCount - 1) % 3) + 1}`), "smile", { temporary: true });
        };
        wrapper.addEventListener("click", onTap);
        wrapper.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); }
        });
      }
    },

    /**
     * Pose + speech. A temporary line (a card tap, a tip) returns to the last evaluated state after a few seconds.
     */
    say(text, pose = "wave", { temporary = false } = {}) {
      if (!figure) return;
      clearTimeout(restoreTimer);
      setPose(figure, pose);
      if (pose === "celebrate") replay(figure, "b-jump");
      speak(text);
      const bubble = container.querySelector(".mascot-bubble");
      replay(bubble, "pop");
      this.show();
      if (temporary) restoreTimer = setTimeout(() => this.restoreDefault(), RESTORE_AFTER_MS);
    },

    /** What she says about a person's results (pose table from the frontend requirements). */
    evaluateState(person, trendsData) {
      let state;
      if (!person) {
        const name = (typeof Auth !== "undefined" && Auth.username()) || "";
        state = { key: "mascot.begin", params: { name }, pose: "wave" };
      } else if (!trendsData || !Array.isArray(trendsData.trends) || trendsData.trends.length === 0) {
        state = person.is_self
          ? { key: "mascot.startSelf", params: {}, pose: "wave" }
          : { key: "mascot.startOther", params: { name: person.display_name }, pose: "wave" };
      } else if (trendsData.reminder && trendsData.reminder.overdue && trendsData.reminder.next_due) {
        state = { key: "mascot.overdue", params: { dueDate: trendsData.reminder.next_due }, pose: "calendar" };
      } else {
        const out = trendsData.trends.filter((tr) => tr.status === "high" || tr.status === "low").length;
        state = out === 0
          ? { key: "mascot.allNormal", params: {}, pose: "smile" }
          : out === 1
            ? { key: "mascot.outOne", params: {}, pose: "pointing" }
            : { key: "mascot.outMany", params: { n: out }, pose: "pointing" };
      }
      lastEvaluated = state;
      this.say(this.lineFor(state), state.pose);
    },

    lineFor(state) {
      const params = { ...state.params };
      if (params.dueDate) params.date = I18n.formatDate(params.dueDate);
      return t(state.key, params);
    },

    restoreDefault() {
      if (lastEvaluated) this.say(this.lineFor(lastEvaluated), lastEvaluated.pose);
    },

    setLoading(message) {
      this.say(message || t("upload.readingReport"), "reading");
    },

    setChatWaiting() {
      this.say(t("mascot.looking"), "thinking");
    },

    setError(errorMessage) {
      this.say(errorMessage || t("error.generic"), "shrug");
    },

    show() {
      if (container) container.style.display = "flex";
    },

    hide() {
      if (container) container.style.display = "none";
    }
  };
})();

if (typeof window !== "undefined") {
  window.Mascot = Mascot;
} else if (typeof globalThis !== "undefined") {
  globalThis.Mascot = Mascot;
}
