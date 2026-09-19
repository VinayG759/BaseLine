/**
 * Baseline App Controller
 *
 * Layout: top bar (menu, profile) -> whose results -> Dr. Bindu -> tabs (Results | History | Ask).
 * Adding a report is two steps: read the photo (preview, nothing saved), then review and save.
 * The name printed on a report is checked against the person; someone else's report is shown, never saved.
 */

const State = {
  people: [],
  currentPerson: null,
  currentLang: "en",
  trendsData: null,
  reports: [],
  tab: "results",
  photoBlob: null,
  isUploading: false,
  isChatting: false,
  review: null,        // { blob, preview, personId }
  openReportId: null,
  personFormMode: null // "setup" | "add" | "edit"
};

const $ = (id) => document.getElementById(id);
const esc = (text) => escapeHtml(text);

// ---------- Small helpers ----------

// "12 Sept 2026", month names in the chosen language; the doctor view passes "en".
function formatDateDisplay(dateStr, lang = I18n.lang()) {
  return I18n.formatDate(dateStr, lang);
}

function getTodayDisplay() {
  return formatDateDisplay(new Date().toISOString().slice(0, 10), "en");
}

function decimals(x) {
  return (String(x).split(".")[1] || "").length;
}

/** a - b, shown with as many decimals as the printed numbers have (6.4 - 5.6 -> 0.8). */
function difference(a, b) {
  return Number((a - b).toFixed(Math.max(decimals(a), decimals(b))));
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function statusLabel(status) {
  return t(`status.${status || "unknown"}`);
}

/**
 * Technical Concept: Canvas Resizing
 * The photo is drawn onto an in-memory canvas at most 2000 px on its longest side and re-encoded as JPEG,
 * so a 5-12 MB phone photo becomes about 1 MB while printed text stays sharp.
 */
async function shrinkImage(file, maxDimension = 2000, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t("error.photo")));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error(t("error.photo")));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t("error.photo")))), "image/jpeg", quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Every distinct report date for a person, oldest first (the dates live inside each trend's history). */
function collectReportDates(data) {
  if (!data || !Array.isArray(data.trends)) return [];
  return [...new Set(data.trends.flatMap((tr) => (tr.history || []).map((h) => h.date)))].sort();
}

// ---------- Result visuals ----------

/**
 * The normal range as a bar, with a marker at this result: the eye sees at once whether the value sits
 * inside the band and by how much it misses. One-sided ranges ("below 200") shade only their side.
 */
function rangeBar(value, low, high, status) {
  const hasLow = typeof low === "number";
  const hasHigh = typeof high === "number";
  if (!hasLow && !hasHigh) return "";
  const points = [value, low, high].filter((x) => typeof x === "number");
  let min = Math.min(...points);
  let max = Math.max(...points);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.3;
  const a = min - pad;
  const b = max + pad;
  const pct = (x) => Math.max(0, Math.min(100, ((x - a) / (b - a)) * 100));
  const zoneFrom = hasLow ? pct(low) : 0;
  const zoneTo = hasHigh ? pct(high) : 100;
  const labels = [];
  if (hasLow) labels.push(`<span class="rb-limit" style="left:${pct(low).toFixed(1)}%">${esc(low)}</span>`);
  if (hasHigh) labels.push(`<span class="rb-limit" style="left:${pct(high).toFixed(1)}%">${esc(high)}</span>`);
  return `
    <div class="range-bar" aria-hidden="true">
      <div class="rb-track">
        <div class="rb-zone" style="left:${zoneFrom.toFixed(1)}%;width:${(zoneTo - zoneFrom).toFixed(1)}%"></div>
        <div class="rb-marker rb-${esc(status)}" style="left:${pct(value).toFixed(1)}%"></div>
      </div>
      <div class="rb-labels">${labels.join("")}</div>
    </div>`;
}

/** "0.8 % above the upper limit" and friends. The arithmetic is done here, from the printed numbers. */
function differenceText(value, low, high, unit, status) {
  if (status === "high" && typeof high === "number") return t("diff.above", { diff: difference(value, high), unit });
  if (status === "low" && typeof low === "number") return t("diff.below", { diff: difference(low, value), unit });
  if (status === "normal") return t("diff.inside");
  return t("diff.noRange");
}

/**
 * Technical Concept: SVG Coordinate Space
 * (0,0) is the top-left, so higher lab numbers get smaller y values to rise upwards on the chart.
 */
function createTrendSvgChart(trend) {
  const width = 280;
  const height = 72;
  const padTop = 10;
  const padBottom = 20;
  const padX = 32;
  const entries = Array.isArray(trend.history) && trend.history.length > 0
    ? trend.history
    : [{ date: null, value: trend.current }];
  const history = entries.map((h) => h.value);
  const dates = entries.map((h) => h.date).filter(Boolean);
  const numbers = [...history];
  if (typeof trend.ref_low === "number") numbers.push(trend.ref_low);
  if (typeof trend.ref_high === "number") numbers.push(trend.ref_high);
  let minVal = Math.min(...numbers);
  let maxVal = Math.max(...numbers);
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  } else {
    const range = maxVal - minVal;
    minVal -= range * 0.1;
    maxVal += range * 0.1;
  }
  const getY = (val) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    return padTop + (1 - (clamped - minVal) / (maxVal - minVal)) * (height - padTop - padBottom);
  };
  const getX = (index, total) => (total <= 1 ? width / 2 : padX + (index / (total - 1)) * (width - 2 * padX));

  let svg = "";
  if (typeof trend.ref_low === "number" || typeof trend.ref_high === "number") {
    const bandTop = getY(typeof trend.ref_high === "number" ? trend.ref_high : maxVal);
    const bandBottom = getY(typeof trend.ref_low === "number" ? trend.ref_low : minVal);
    svg += `<rect x="0" y="${bandTop.toFixed(1)}" width="${width}" height="${Math.max(2, bandBottom - bandTop).toFixed(1)}" class="svg-band"/>`;
  }
  const points = history.map((val, idx) => ({ x: getX(idx, history.length), y: getY(val) }));
  if (points.length > 1) {
    svg += `<path d="${points.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}" class="svg-line" fill="none"/>`;
  }
  points.forEach((p, idx) => {
    const latest = idx === points.length - 1;
    const out = latest && (trend.status === "high" || trend.status === "low");
    svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${latest ? 5.5 : 3.5}" class="${out ? "svg-dot svg-dot-out" : latest ? "svg-dot svg-dot-latest" : "svg-dot"}"/>`;
  });
  if (dates.length > 0) {
    svg += `<text x="${points[0].x.toFixed(1)}" y="${height - 4}" text-anchor="${points.length > 1 ? "start" : "middle"}" class="svg-date-label">${esc(formatDateDisplay(dates[0]))}</text>`;
    if (points.length > 1 && dates.length > 1) {
      svg += `<text x="${points[points.length - 1].x.toFixed(1)}" y="${height - 4}" text-anchor="end" class="svg-date-label">${esc(formatDateDisplay(dates[dates.length - 1]))}</text>`;
    }
  }
  const label = t("card.chart", { test: trend.test_name, n: history.length, value: trend.current });
  return `<svg viewBox="0 0 ${width} ${height}" class="trend-chart-svg" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}

const DIRECTION_ICON = { rising: "arrow-up", falling: "arrow-down", stable: "arrow-right" };

/** One result card: value and status, where it sits in the normal range, its history, a plain sentence. */
function trendCardHtml(trend) {
  const status = trend.status || "unknown";
  const out = status === "high" || status === "low";
  const dirIcon = DIRECTION_ICON[trend.direction];
  const history = (trend.history || []).length > 1
    ? `<div class="tc-history"><span class="tc-history-label">${esc(t("chart.history"))}</span>${createTrendSvgChart(trend)}</div>`
    : "";
  return `
    <article class="card trend-card ${out ? "card-out-of-range" : ""} ${trend.updated ? "trend-card-updated" : ""}"
             tabindex="0" role="button" aria-label="${esc(t("card.tap", { test: trend.test_name }))}"
             data-summary="${esc(trend.summary)}">
      <div class="tc-head">
        <h3 class="test-name">${esc(trend.test_name)}</h3>
        <span class="status-pill pill-${esc(status)}">${esc(statusLabel(status))}</span>
      </div>
      <div class="tc-value ${out ? "value-danger" : ""}">
        <span class="test-value">${esc(trend.current)}</span>
        <span class="test-unit">${esc(trend.unit)}</span>
        ${dirIcon ? `<span class="tc-dir" aria-label="${esc(t("dir." + trend.direction))}">${Icons.svg(dirIcon)}</span>` : ""}
      </div>
      ${rangeBar(trend.current, trend.ref_low, trend.ref_high, status)}
      <p class="tc-diff tc-diff-${esc(status)}">${esc(differenceText(trend.current, trend.ref_low, trend.ref_high, trend.unit, status))}</p>
      ${history}
      <p class="trend-summary">${esc(trend.summary)}</p>
    </article>`;
}

function bindCardTaps(container) {
  container.querySelectorAll(".trend-card").forEach((card) => {
    const speak = () => {
      const summary = card.getAttribute("data-summary");
      if (summary) Mascot.say(summary, "pointing", { temporary: true });
    };
    card.addEventListener("click", speak);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        speak();
      }
    });
  });
}

function rangeText(r) {
  const limits = { low: r.ref_low, high: r.ref_high, unit: r.unit };
  if (typeof r.ref_low === "number" && typeof r.ref_high === "number") return t("range.both", limits);
  if (typeof r.ref_high === "number") return t("range.below", limits);
  if (typeof r.ref_low === "number") return t("range.above", limits);
  return t("range.none");
}

/** A values table for one report (read-only), each row with its status. */
function valuesTableHtml(rows) {
  return `
    <table class="values-table">
      <thead><tr><th>${esc(t("review.test"))}</th><th>${esc(t("review.value"))}</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${esc(r.test_name)}<span class="vt-range">${esc(rangeText(r))}</span></td>
          <td class="vt-value">${esc(r.value)} <span class="test-unit">${esc(r.unit)}</span></td>
          <td><span class="status-pill pill-${esc(r.status)}">${esc(statusLabel(r.status))}</span></td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

/** Editable rows for reviewing or correcting values. Every box has a visible label. */
function rowsEditorHtml(rows) {
  const box = (cls, key, value, extra = "") => `
    <label class="er-field ${cls}-field"><span class="er-label">${esc(t(key))}</span>
      <input class="date-input ${cls}" value="${esc(value ?? "")}" ${extra}></label>`;
  const rowHtml = (r = {}) => `
    <div class="edit-row">
      ${box("er-name", "review.test", r.test_name, 'maxlength="60"')}
      ${box("er-value", "review.value", r.value, 'inputmode="decimal"')}
      ${box("er-unit", "review.unit", r.unit, 'maxlength="20"')}
      ${box("er-low", "review.low", r.ref_low, 'inputmode="decimal"')}
      ${box("er-high", "review.high", r.ref_high, 'inputmode="decimal"')}
      <button type="button" class="icon-btn er-remove" aria-label="${esc(t("review.removeRow"))}">${Icons.svg("trash")}</button>
    </div>`;
  return `
    <div class="rows-editor">
      <div class="edit-rows">${rows.map(rowHtml).join("")}</div>
      <template class="edit-row-template">${rowHtml()}</template>
      <button type="button" class="btn btn-secondary btn-sm er-add">${Icons.svg("plus")}<span>${esc(t("review.addRow"))}</span></button>
    </div>`;
}

function bindRowsEditor(root) {
  const rows = root.querySelector(".edit-rows");
  const template = root.querySelector(".edit-row-template");
  root.addEventListener("click", (e) => {
    const remove = e.target.closest(".er-remove");
    if (remove) remove.closest(".edit-row").remove();
    if (e.target.closest(".er-add")) {
      rows.append(template.content.cloneNode(true));
      rows.lastElementChild.querySelector(".er-name").focus();
    }
  });
}

function readRowsEditor(root) {
  return [...root.querySelectorAll(".edit-rows .edit-row")].map((row) => ({
    test_name: row.querySelector(".er-name").value.trim(),
    value: row.querySelector(".er-value").value.trim(),
    unit: row.querySelector(".er-unit").value.trim(),
    ref_low: row.querySelector(".er-low").value.trim() || null,
    ref_high: row.querySelector(".er-high").value.trim() || null
  })).filter((r) => r.test_name || r.value);
}

// ---------- The app ----------

const BaselineApp = {
  async init() {
    if (!Auth.token()) {
      Auth.goToLogin();
      return;
    }
    State.currentLang = I18n.lang();
    Mascot.init($("mascot-container"));
    const name = Auth.username() || (Auth.email() || "").split("@")[0];
    Mascot.say(t("mascot.hiLoading", { name }), "wave");
    this.renderProfile();
    this.bindEvents();
    $("lang-select").value = State.currentLang;
    $("theme-switch").checked = document.documentElement.getAttribute("data-theme") === "dark";
    document.addEventListener("baseline:lang", (e) => this.onLanguageChanged(e.detail));
    await this.loadPeople();
  },

  // ----- Header: profile and menu -----

  renderProfile() {
    const name = Auth.username() || (Auth.email() || "").split("@")[0];
    $("avatar-initials").textContent = initials(name);
    $("profile-name").textContent = name;
    $("profile-email").textContent = Auth.email() || "";
    const self = State.people.find((p) => p.is_self);
    $("profile-edit-label").textContent = t(self ? "profile.edit" : "profile.setup");
  },

  toggleProfileMenu(open) {
    const menu = $("profile-menu");
    const show = open ?? menu.hidden;
    menu.hidden = !show;
    $("profile-btn").setAttribute("aria-expanded", String(show));
  },

  toggleMenu(open) {
    const drawer = $("menu-drawer");
    drawer.hidden = !open;
    $("menu-backdrop").hidden = !open;
    $("menu-btn").setAttribute("aria-expanded", String(open));
    if (open) $("menu-close-btn").focus();
  },

  setTheme(dark) {
    const theme = dark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("baseline_theme", theme); } catch (e) {}
  },

  // ----- People -----

  async loadPeople() {
    try {
      const response = await API.getPeople();
      State.people = response.people || [];
      this.renderProfile();
      if (State.people.length === 0) {
        this.renderPeople();
        Mascot.evaluateState(null, null);
        this.openPersonForm("setup");
        return;
      }
      let saved = null;
      try { saved = localStorage.getItem("baseline_person_id"); } catch (e) {}
      const person = State.people.find((p) => p.person_id === saved) || State.people[0];
      await this.selectPerson(person.person_id);
    } catch (err) {
      Mascot.setError(err.message);
      this.showToast(err.message, "error");
    }
  },

  personMeta(p) {
    if (!p) return "";
    const parts = [];
    if (typeof p.age === "number") parts.push(t("person.years", { age: p.age }));
    if (p.gender) parts.push(t(`gender.${p.gender}`));
    return parts.join(" · ");
  },

  renderPeople() {
    const select = $("person-select");
    select.innerHTML = "";
    const addBtn = $("add-person-btn");
    if (State.people.length === 0) {
      const option = new Option(t("app.noOne"), "", true, true);
      option.disabled = true;
      select.append(option);
      addBtn.classList.add("needs-attention");
    } else {
      addBtn.classList.remove("needs-attention");
    }
    State.people.forEach((p) => {
      const label = p.is_self ? t("app.myself", { name: p.display_name }) : p.display_name;
      const selected = Boolean(State.currentPerson && p.person_id === State.currentPerson.person_id);
      select.append(new Option(label, p.person_id, selected, selected));
    });
    $("person-meta").textContent = this.personMeta(State.currentPerson);
    $("edit-person-btn").hidden = !State.currentPerson;
  },

  async selectPerson(personId) {
    if (State.isUploading) {
      this.showToast(t("upload.inProgress"), "info");
      this.renderPeople();
      return;
    }
    const person = State.people.find((p) => p.person_id === personId);
    if (!person) return;
    State.currentPerson = person;
    try { localStorage.setItem("baseline_person_id", person.person_id); } catch (e) {}
    this.renderPeople();
    this.clearChat();
    await this.loadPersonData();
  },

  async loadPersonData() {
    await Promise.all([this.loadTrends(), this.loadHistory()]);
  },

  openPersonForm(mode, person = null) {
    State.personFormMode = mode;
    State.editingPersonId = person ? person.person_id : null;
    const hasSelf = State.people.some((p) => p.is_self);
    $("person-modal-title").textContent = t(mode === "setup" ? "setup.title" : mode === "edit" ? "person.editTitle" : "person.modalTitle");
    $("person-modal-intro").hidden = mode !== "setup";
    $("person-modal-intro").textContent = t("setup.intro");
    $("person-save-btn").textContent = t(mode === "setup" ? "setup.save" : mode === "edit" ? "person.saveChanges" : "person.save");
    $("person-cancel-btn").textContent = t(mode === "setup" ? "setup.later" : "person.cancel");
    $("pf-self-row").hidden = mode !== "add" || hasSelf;
    $("pf-self").checked = false;
    $("pf-title").value = person ? person.title : "";
    $("pf-name").value = person ? person.name : (mode === "setup" ? (Auth.username() || "") : "");
    $("pf-gender").value = person ? person.gender : "";
    $("pf-age").value = person && typeof person.age === "number" ? person.age : "";
    $("pf-height").value = person && person.height_cm != null ? person.height_cm : "";
    $("pf-weight").value = person && person.weight_kg != null ? person.weight_kg : "";
    $("person-form-error").textContent = "";
    this.showModal("person-modal");
    $("pf-name").focus();
  },

  async savePersonForm() {
    const error = $("person-form-error");
    error.textContent = "";
    const fields = {
      title: $("pf-title").value,
      name: $("pf-name").value,
      gender: $("pf-gender").value,
      age: $("pf-age").value,
      height_cm: $("pf-height").value || null,
      weight_kg: $("pf-weight").value || null
    };
    const button = $("person-save-btn");
    button.disabled = true;
    try {
      let person;
      if (State.personFormMode === "edit") {
        person = await API.updatePerson(State.editingPersonId, fields);
        State.people = State.people.map((p) => (p.person_id === person.person_id ? person : p));
        this.showToast(t("person.saved"), "success");
      } else {
        const isSelf = State.personFormMode === "setup" || $("pf-self").checked;
        person = await API.addPerson({ ...fields, is_self: isSelf });
        State.people.push(person);
        this.showToast(t("person.added", { name: person.display_name }), "success");
      }
      this.hideModal("person-modal");
      this.renderProfile();
      await this.selectPerson(person.person_id);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  },

  // ----- Results -----

  async loadTrends() {
    if (!State.currentPerson) return;
    const container = $("trends-container");
    container.innerHTML = `<div class="card loading-card" role="status"><p>${esc(t("trends.loading"))}</p></div>`;
    try {
      const data = await API.getTrends(State.currentPerson.person_id, State.currentLang);
      State.trendsData = data;
      this.renderReminderAndPath(data);
      this.renderTrendCards(data);
      $("menu-doctor-btn").hidden = !(data.trends && data.trends.length);   // nothing to show a doctor yet
      Mascot.evaluateState(State.currentPerson, data);
    } catch (err) {
      container.innerHTML = `<div class="card error-card" role="alert"><p>${esc(err.message)}</p></div>`;
      Mascot.setError(err.message);
    }
  },

  renderTrendCards(data) {
    const container = $("trends-container");
    if (!data || !Array.isArray(data.trends) || data.trends.length === 0) {
      container.innerHTML = `
        <div class="card empty-trends-card">
          <div class="empty-icon">${Icons.svg("file-text")}</div>
          <h3>${esc(t("trends.emptyTitle"))}</h3>
          <p>${esc(t("trends.emptyText"))}</p>
        </div>`;
      return;
    }
    container.innerHTML = data.trends.map(trendCardHtml).join("");
    bindCardTaps(container);
  },

  renderReminderAndPath(data) {
    const section = $("reminder-path-section");
    const reminder = data && data.reminder;
    const dates = collectReportDates(data);
    if (!reminder && dates.length === 0) {
      section.hidden = true;
      section.innerHTML = "";
      return;
    }
    let nodes = dates.map((d) => `
      <div class="path-node past-node">
        <div class="node-circle" title="${esc(t("path.reportDate"))}">${Icons.svg("file-text")}</div>
        <span class="node-date">${esc(formatDateDisplay(d))}</span>
      </div>
      <div class="path-connector" aria-hidden="true"></div>`).join("");
    if (reminder && reminder.next_due) {
      const overdue = Boolean(reminder.overdue);
      nodes += `
        <div class="path-node locked-node ${overdue ? "overdue-node" : ""}">
          <div class="node-circle" title="${esc(t(overdue ? "path.overdueTitle" : "path.nextTitle"))}">${Icons.svg(overdue ? "alert" : "lock")}</div>
          <span class="node-label">${esc(t(overdue ? "path.overdue" : "path.next"))}</span>
          <span class="node-date">${esc(formatDateDisplay(reminder.next_due))}</span>
        </div>`;
    }
    section.hidden = false;
    section.innerHTML = `
      <div class="card history-path-card">
        <h3 class="path-heading">${esc(t("path.heading"))}</h3>
        <div class="history-path-track" role="list">${nodes}</div>
      </div>`;
  },

  async renderLatestSummary() {
    const card = $("latest-summary");
    const latest = State.reports[0];
    if (!latest || !State.currentPerson) {
      card.hidden = true;
      return;
    }
    const personId = State.currentPerson.person_id;
    // Draw the card in the current language at once; the summary (maybe being written) fills in after.
    card.hidden = false;
    card.innerHTML = `
      <div class="summary-head">
        <span class="summary-icon">${Icons.svg("sparkles")}</span>
        <div>
          <h2 class="card-title">${esc(t("latest.title"))}</h2>
          <p class="card-hint">${esc(t("latest.of", { date: formatDateDisplay(latest.report_date) }))}</p>
        </div>
      </div>
      <p class="summary-text summary-loading">${esc(t("trends.loading"))}</p>
      <button type="button" class="btn btn-secondary btn-sm" data-open-report="${esc(latest.report_id)}">
        ${Icons.svg("file-text")}<span>${esc(t("latest.view"))}</span>
      </button>`;
    try {
      const detail = await API.getReport(personId, latest.report_id, State.currentLang);
      if (!State.currentPerson || State.currentPerson.person_id !== personId) return;
      const text = card.querySelector(".summary-text");
      text.classList.remove("summary-loading");
      text.textContent = I18n.server(detail.summary);
    } catch (err) {
      card.hidden = true;
    }
  },

  // ----- History -----

  async loadHistory() {
    if (!State.currentPerson) return;
    try {
      const data = await API.listReports(State.currentPerson.person_id);
      State.reports = data.reports || [];
    } catch (err) {
      State.reports = [];
    }
    this.renderHistory();
    await this.renderLatestSummary();
  },

  renderHistory() {
    const list = $("history-list");
    if (State.reports.length === 0) {
      list.innerHTML = `<li class="card history-empty">${Icons.svg("history")}<p>${esc(t("history.empty"))}</p></li>`;
      return;
    }
    list.innerHTML = State.reports.map((r) => `
      <li>
        <button type="button" class="card history-item" data-open-report="${esc(r.report_id)}">
          <span class="history-icon">${Icons.svg("file-text")}</span>
          <span class="history-text">
            <span class="history-date">${esc(formatDateDisplay(r.report_date))}</span>
            <span class="history-meta">${esc([r.lab_name, t("history.results", { n: r.result_count })].filter(Boolean).join(" · "))}</span>
          </span>
          ${Icons.svg("chevron-right", "history-chevron")}
        </button>
      </li>`).join("");
  },

  async openReport(reportId, { editing = false } = {}) {
    if (!State.currentPerson) return;
    State.openReportId = reportId;
    const content = $("report-content");
    content.innerHTML = `<p class="loading-line">${esc(t("trends.loading"))}</p>`;
    this.showModal("report-modal");
    try {
      const d = await API.getReport(State.currentPerson.person_id, reportId, State.currentLang);
      const measures = [
        d.height_cm != null ? t("report.height", { value: d.height_cm }) : null,
        d.weight_kg != null ? t("report.weight", { value: d.weight_kg }) : null
      ].filter(Boolean).join(" · ");
      const photo = d.image_url
        ? `<img class="report-photo" src="${esc(d.image_url)}" alt="${esc(t("report.photo"))}">`
        : `<p class="report-no-photo">${Icons.svg("image")}<span>${esc(t("report.noPhoto"))}</span></p>`;
      content.innerHTML = `
        <div class="modal-head">
          <h2 id="report-title" class="modal-title">${esc(t("report.title", { date: formatDateDisplay(d.report_date) }))}</h2>
          <button type="button" class="icon-btn" data-close="report-modal" aria-label="${esc(t("common.close"))}">${Icons.svg("x")}</button>
        </div>
        <p class="card-hint">${esc([d.lab_name, measures].filter(Boolean).join(" · "))}</p>
        <h3 class="section-label">${esc(t("report.summary"))}</h3>
        <p class="summary-text">${esc(I18n.server(d.summary))}</p>
        <h3 class="section-label">${esc(t("report.values"))}</h3>
        <div id="report-values">${editing ? rowsEditorHtml(d.readings) : valuesTableHtml(d.readings)}</div>
        <div id="report-error" class="form-error" role="alert"></div>
        <details class="report-photo-box" ${editing ? "" : "open"}>
          <summary>${esc(t("report.photo"))}</summary>
          ${photo}
        </details>
        <div class="modal-actions">
          ${editing
            ? `<button type="button" class="btn btn-secondary btn-sm" data-report-action="cancel-edit">${esc(t("review.cancel"))}</button>
               <button type="button" class="btn btn-primary btn-sm" data-report-action="save-edit">${esc(t("person.saveChanges"))}</button>`
            : `<button type="button" class="btn btn-danger btn-sm" data-report-action="delete">${Icons.svg("trash")}<span>${esc(t("report.delete"))}</span></button>
               <button type="button" class="btn btn-secondary btn-sm" data-report-action="edit">${Icons.svg("pencil")}<span>${esc(t("report.edit"))}</span></button>`}
        </div>`;
      if (editing) bindRowsEditor(content);
      const img = content.querySelector(".report-photo");
      if (img) img.addEventListener("error", () => { img.outerHTML = `<p class="report-no-photo">${esc(t("report.noPhoto"))}</p>`; });
    } catch (err) {
      content.innerHTML = `<p class="form-error">${esc(err.message)}</p>
        <div class="modal-actions"><button type="button" class="btn btn-secondary btn-sm" data-close="report-modal">${esc(t("common.close"))}</button></div>`;
    }
  },

  async reportAction(action) {
    const reportId = State.openReportId;
    const personId = State.currentPerson.person_id;
    if (action === "edit") return this.openReport(reportId, { editing: true });
    if (action === "cancel-edit") return this.openReport(reportId);
    if (action === "delete") {
      if (!window.confirm(t("report.confirmDelete"))) return;
      try {
        await API.deleteReport(personId, reportId);
        this.hideModal("report-modal");
        this.showToast(t("report.deleted"), "success");
        await this.loadPersonData();
      } catch (err) {
        $("report-error").textContent = err.message;
      }
    }
    if (action === "save-edit") {
      try {
        await API.editReport(reportId, { person_id: personId, lang: State.currentLang, readings: readRowsEditor($("report-values")) });
        this.showToast(t("report.saved"), "success");
        await this.loadPersonData();
        await this.openReport(reportId);
      } catch (err) {
        $("report-error").textContent = err.message;
      }
    }
  },

  // ----- Adding a report: photo -> read (preview) -> review -> save -----

  async handlePhotoSelect(file) {
    if (!file) return;
    const status = $("upload-status");
    status.textContent = "";
    status.className = "upload-status";
    try {
      State.photoBlob = await shrinkImage(file);
      $("photo-preview").src = URL.createObjectURL(State.photoBlob);
      $("photo-preview-container").hidden = false;
      $("read-report-btn").disabled = false;
    } catch (err) {
      status.textContent = err.message;
      status.className = "upload-status status-error";
    }
  },

  clearPhoto() {
    State.photoBlob = null;
    $("photo-preview-container").hidden = true;
    $("photo-preview").removeAttribute("src");
    $("read-report-btn").disabled = true;
    $("camera-input").value = "";
    $("gallery-input").value = "";
    $("custom-report-date").value = "";
  },

  setReadButtonBusy(busy) {
    const btn = $("read-report-btn");
    btn.classList.toggle("btn-loading", busy);
    btn.disabled = busy || !State.photoBlob;
    btn.querySelector("span").textContent = t(busy ? "upload.reading" : "upload.read");
  },

  async readReport(blob = State.photoBlob, personId = State.currentPerson && State.currentPerson.person_id) {
    if (State.isUploading) return;
    const status = $("upload-status");
    const missing = !personId ? t("upload.needPerson") : !blob ? t("upload.needPhoto") : null;
    if (missing) {
      status.textContent = missing;
      status.className = "upload-status status-error";
      Mascot.say(missing, "shrug");
      return;
    }
    State.isUploading = true;
    this.setReadButtonBusy(true);
    status.textContent = t("upload.readingReport");
    status.className = "upload-status status-loading";
    Mascot.setLoading(t("upload.readingReport"));
    try {
      const form = new FormData();
      form.append("person_id", personId);
      form.append("file", blob, "report.jpg");
      form.append("lang", State.currentLang);
      const customDate = $("custom-report-date").value;
      if (customDate) form.append("report_date", customDate);
      const preview = await API.previewReport(form);
      status.textContent = "";
      State.review = { blob, preview, personId };
      this.renderReview();
      Mascot.restoreDefault();
    } catch (err) {
      status.textContent = err.message;
      status.className = "upload-status status-error";
      Mascot.setError(err.message);
    } finally {
      State.isUploading = false;
      this.setReadButtonBusy(false);
    }
  },

  renderReview() {
    const { preview, blob } = State.review;
    const person = State.people.find((p) => p.person_id === preview.person_id);
    const check = preview.name_check || { status: "unknown" };
    const content = $("review-content");
    const thumb = `<img class="review-thumb" src="${esc(URL.createObjectURL(blob))}" alt="${esc(t("upload.previewAlt"))}">`;
    const head = `
      <div class="modal-head">
        <h2 id="review-title" class="modal-title">${esc(t("review.title"))}</h2>
        <button type="button" class="icon-btn" data-review-action="cancel" aria-label="${esc(t("common.close"))}">${Icons.svg("x")}</button>
      </div>`;

    if (check.status === "different") {
      // Someone else's report: show what it says, save nothing.
      const analysis = preview.analysis || { trends: [], summary: "" };
      const line = t("review.nameDifferent", { name: check.detected_name, person: person.display_name });
      content.innerHTML = `${head}
        <div class="name-banner banner-danger">${Icons.svg("shield-alert")}<p>${esc(line)}</p></div>
        <h3 class="section-label">${esc(t("report.summary"))}</h3>
        <p class="summary-text">${esc(I18n.server(analysis.summary))}</p>
        <div class="trends-list review-analysis">${analysis.trends.map(trendCardHtml).join("")}</div>
        <div class="modal-actions"><button type="button" class="btn btn-primary btn-sm" data-review-action="cancel">${esc(t("review.close"))}</button></div>`;
      Mascot.say(line, "shrug", { temporary: true });
      this.showModal("review-modal");
      return;
    }

    if (check.status === "other_person") {
      content.innerHTML = `${head}
        <div class="name-banner banner-warn">${Icons.svg("users")}<p>${esc(t("review.nameOther", { name: check.display_name }))}</p></div>
        ${thumb}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-review-action="cancel">${esc(t("review.cancel"))}</button>
          <button type="button" class="btn btn-primary btn-sm" data-review-action="switch" data-person="${esc(check.person_id)}">${esc(t("review.switchTo", { name: check.display_name }))}</button>
        </div>`;
      this.showModal("review-modal");
      return;
    }

    const banner = check.status === "same"
      ? `<div class="name-banner banner-ok">${Icons.svg("shield-check")}<p>${esc(t("review.nameSame", { name: check.detected_name, person: person.display_name }))}</p></div>`
      : `<div class="name-banner banner-warn">${Icons.svg("shield-alert")}<div><p>${esc(t("review.nameUnknown"))}</p>
           <label class="check-row"><input type="checkbox" id="review-confirm-name"><span>${esc(t("review.confirmName", { person: person.display_name }))}</span></label></div></div>`;
    content.innerHTML = `${head}
      ${banner}
      <p class="modal-intro">${esc(t("review.intro"))}</p>
      ${thumb}
      <div class="form-row">
        <div class="field">
          <label for="review-date" class="field-label">${esc(t("review.date"))}</label>
          <input type="date" id="review-date" class="date-input" value="${esc(preview.report_date || "")}">
        </div>
      </div>
      <div id="review-rows">${rowsEditorHtml(preview.readings)}</div>
      <h3 class="section-label">${esc(t("review.measures"))}</h3>
      <div class="form-row">
        <div class="field">
          <label for="review-height" class="field-label">${esc(t("person.height"))}</label>
          <input type="number" id="review-height" class="date-input" min="30" max="250" step="0.1" inputmode="decimal" value="${esc(person.height_cm ?? "")}">
        </div>
        <div class="field">
          <label for="review-weight" class="field-label">${esc(t("person.weight"))}</label>
          <input type="number" id="review-weight" class="date-input" min="1" max="350" step="0.1" inputmode="decimal" value="${esc(person.weight_kg ?? "")}">
        </div>
      </div>
      <div id="review-error" class="form-error" role="alert"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-review-action="cancel">${esc(t("review.cancel"))}</button>
        <button type="button" class="btn btn-primary btn-sm" id="review-save-btn" data-review-action="save">${esc(t("review.save"))}</button>
      </div>`;
    bindRowsEditor($("review-rows"));
    this.showModal("review-modal");
  },

  async reviewAction(action, button) {
    if (action === "cancel") {
      this.hideModal("review-modal");
      State.review = null;
      Mascot.restoreDefault();
      return;
    }
    if (action === "switch") {
      const personId = button.dataset.person;
      const blob = State.review.blob;
      this.hideModal("review-modal");
      await this.selectPerson(personId);
      await this.readReport(blob, personId);
      return;
    }
    if (action === "save") await this.saveReview();
  },

  async saveReview() {
    const { preview, blob, personId } = State.review;
    const error = $("review-error");
    error.textContent = "";
    const reportDate = $("review-date").value;
    if (!reportDate) {
      error.textContent = t("review.dateNeeded");
      return;
    }
    const confirmBox = $("review-confirm-name");
    const payload = {
      report_date: reportDate,
      lab_name: preview.lab_name,
      patient_name: preview.patient_name,
      readings: readRowsEditor($("review-rows")),
      height_cm: $("review-height").value || null,
      weight_kg: $("review-weight").value || null,
      name_confirmed: confirmBox ? confirmBox.checked : false,
      lang: State.currentLang
    };
    const saveBtn = $("review-save-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = t("review.saving");
    try {
      const form = new FormData();
      form.append("person_id", personId);
      form.append("file", blob, "report.jpg");
      form.append("payload", JSON.stringify(payload));
      const result = await API.confirmReport(form);
      this.hideModal("review-modal");
      State.review = null;
      this.clearPhoto();
      const person = State.people.find((p) => p.person_id === personId);
      if (person && payload.height_cm) person.height_cm = Number(payload.height_cm);
      if (person && payload.weight_kg) person.weight_kg = Number(payload.weight_kg);
      const title = person && person.is_self ? t("celebrate.self") : t("celebrate.other", { name: person ? person.display_name : "" });
      const count = (result.trends || []).filter((tr) => tr.updated).length;
      const message = t("upload.added", { n: count, date: formatDateDisplay(result.report.report_date) });
      this.triggerCelebration(title, message);
      $("upload-status").textContent = message;
      $("upload-status").className = "upload-status status-success";
      await this.loadPersonData();
      Mascot.say(`${title} ${message}`, "celebrate", { temporary: true });   // after the reload, so it isn't cut short
    } catch (err) {
      error.textContent = err.message;
      saveBtn.disabled = false;
      saveBtn.textContent = t("review.save");
    }
  },

  // ----- Doctor view (clinical English) -----

  async openDoctorView() {
    if (!State.currentPerson) return;
    this.toggleMenu(false);
    const content = $("doctor-modal-content");
    content.innerHTML = `<p class="clinical-loading">Generating clinical report for ${esc(State.currentPerson.display_name)}...</p>`;
    this.showModal("doctor-modal");
    Mascot.hide();
    try {
      this.renderDoctorView(await API.getDoctorView(State.currentPerson.person_id));
    } catch (err) {
      content.innerHTML = `<p class="clinical-error">${esc(err.message)}</p>`;
    }
  },

  renderDoctorView(docData) {
    const p = State.currentPerson;
    const patient = [
      typeof p.age === "number" ? `Age ${p.age}` : null,
      p.gender ? p.gender[0].toUpperCase() + p.gender.slice(1) : null,
      p.height_cm != null ? `Height ${p.height_cm} cm` : null,
      p.weight_kg != null ? `Weight ${p.weight_kg} kg` : null
    ].filter(Boolean).join(" · ");
    const dates = (docData.report_dates || []).map((d) => formatDateDisplay(d, "en")).join(", ") || "None";
    const tables = (docData.tests || []).map((test) => `
      <div class="clinical-table-wrapper">
        <h3 class="clinical-test-title">${esc(test.test_name)}</h3>
        <table class="clinical-table">
          <thead><tr><th scope="col">Date</th><th scope="col">Result</th><th scope="col">Unit</th><th scope="col">Reference Range</th><th scope="col">Flag</th></tr></thead>
          <tbody>${(test.results || []).map((r) => {
            const flagged = r.flag === "H" || r.flag === "L";
            const range = typeof r.ref_low === "number" && typeof r.ref_high === "number" ? `${r.ref_low}–${r.ref_high}`
              : typeof r.ref_high === "number" ? `< ${r.ref_high}` : typeof r.ref_low === "number" ? `> ${r.ref_low}` : "—";
            return `<tr class="${flagged ? "flagged-row" : ""}"><td>${esc(formatDateDisplay(r.date, "en"))}</td><td>${esc(r.value)}</td>
              <td>${esc(r.unit)}</td><td>${esc(range)}</td><td class="flag-cell">${flagged ? `<strong>${esc(r.flag)}</strong>` : ""}</td></tr>`;
          }).join("")}</tbody>
        </table>
      </div>`).join("") || `<p class="clinical-empty">No clinical records found for this person.</p>`;
    $("doctor-modal-content").innerHTML = `
      <div class="clinical-header">
        <h2 class="clinical-main-title">Baseline - Lab History for ${esc(p.display_name)}</h2>
        ${patient ? `<p class="clinical-dates">${esc(patient)}</p>` : ""}
        <p class="clinical-dates">Report dates: ${esc(dates)}</p>
        <p class="clinical-meta">Generated: ${esc(getTodayDisplay())}</p>
      </div>
      <div class="clinical-actions no-print">
        <button type="button" class="btn btn-primary btn-sm" id="print-doctor-btn">${Icons.svg("printer")}<span>${esc(t("doctor.print"))}</span></button>
        <button type="button" class="btn btn-secondary btn-sm" data-close="doctor-modal">${Icons.svg("arrow-left")}<span>${esc(t("doctor.back"))}</span></button>
      </div>
      <div class="clinical-tables-container">${tables}</div>`;
    $("print-doctor-btn").addEventListener("click", () => window.print());
  },

  // ----- Ask -----

  clearChat() {
    $("chat-messages").innerHTML = `<div class="chat-bubble mascot-reply-bubble" data-i18n="chat.welcome">${esc(t("chat.welcome"))}</div>`;
  },

  async handleChatSubmit(questionText) {
    const q = (questionText || "").trim();
    if (!q || State.isChatting || !State.currentPerson) return;
    State.isChatting = true;
    const input = $("chat-input");
    const sendBtn = $("chat-send-btn");
    const messages = $("chat-messages");
    input.value = "";
    $("chat-char-counter").textContent = "0/500";
    sendBtn.disabled = true;
    const add = (className, text) => {
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${className}`;
      bubble.textContent = text;
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
      return bubble;
    };
    add("user-bubble", q);
    const thinking = add("mascot-bubble mascot-thinking", t("chat.thinking"));
    Mascot.setChatWaiting();
    try {
      const response = await API.askChat(State.currentPerson.person_id, q, State.currentLang);
      thinking.remove();
      const reply = I18n.server(response.reply);
      add("mascot-reply-bubble", reply);
      Mascot.say(reply, "pointing", { temporary: true });
    } catch (err) {
      thinking.remove();
      add("chat-error-bubble", err.message);
      Mascot.setError(err.message);
    } finally {
      State.isChatting = false;
      sendBtn.disabled = false;
    }
  },

  // ----- Tabs, modals, language, feedback -----

  switchTab(name) {
    State.tab = name;
    ["results", "history", "ask"].forEach((tab) => {
      const active = tab === name;
      $(`tab-${tab}`).classList.toggle("active", active);
      $(`tab-${tab}`).setAttribute("aria-selected", String(active));
      $(`panel-${tab}`).hidden = !active;
    });
  },

  showModal(id) {
    $(id).hidden = false;
    $(id).style.display = "flex";
    document.body.classList.add("modal-open");
  },

  hideModal(id) {
    $(id).hidden = true;
    $(id).style.display = "none";
    if (![...document.querySelectorAll(".modal-backdrop")].some((m) => !m.hidden)) {
      document.body.classList.remove("modal-open");
    }
    if (id === "doctor-modal") {
      Mascot.show();
      Mascot.restoreDefault();
    }
  },

  onLanguageChanged(lang) {
    State.currentLang = lang;
    $("lang-select").value = lang;
    this.renderProfile();
    this.renderPeople();
    this.renderHistory();
    if (State.currentPerson) {
      this.loadTrends();
      this.renderLatestSummary();
    } else {
      Mascot.evaluateState(null, null);
    }
  },

  triggerCelebration(title, subtitle) {
    const overlay = $("celebration-modal");
    overlay.querySelector(".celebration-title").textContent = title;
    overlay.querySelector(".celebration-subtitle").textContent = subtitle;
    overlay.classList.add("active");
    setTimeout(() => overlay.classList.remove("active"), 2600);
  },

  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `app-toast toast-${type}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("toast-show"), 10);
    setTimeout(() => {
      toast.classList.remove("toast-show");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  bindEvents() {
    // Header
    $("menu-btn").addEventListener("click", () => this.toggleMenu(true));
    $("menu-close-btn").addEventListener("click", () => this.toggleMenu(false));
    $("menu-backdrop").addEventListener("click", () => this.toggleMenu(false));
    $("lang-select").addEventListener("change", (e) => I18n.setLang(e.target.value));
    $("theme-switch").addEventListener("change", (e) => this.setTheme(e.target.checked));
    $("menu-doctor-btn").addEventListener("click", () => this.openDoctorView());
    $("profile-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleProfileMenu();
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".profile-wrap")) this.toggleProfileMenu(false);
    });
    $("profile-edit-btn").addEventListener("click", () => {
      this.toggleProfileMenu(false);
      const self = State.people.find((p) => p.is_self);
      this.openPersonForm(self ? "edit" : "setup", self || null);
    });
    $("logout-btn").addEventListener("click", async () => {
      $("logout-btn").disabled = true;
      await API.logout();
      Auth.goToLogin();
    });

    // People
    $("person-select").addEventListener("change", (e) => this.selectPerson(e.target.value));
    $("add-person-btn").addEventListener("click", () => this.openPersonForm("add"));
    $("edit-person-btn").addEventListener("click", () => this.openPersonForm("edit", State.currentPerson));
    $("person-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.savePersonForm();
    });
    $("person-cancel-btn").addEventListener("click", () => {
      this.hideModal("person-modal");
      if (!State.currentPerson) Mascot.evaluateState(null, null);
    });

    // Tabs
    ["results", "history", "ask"].forEach((tab) => $(`tab-${tab}`).addEventListener("click", () => this.switchTab(tab)));

    // Photo -> read
    $("take-photo-btn").addEventListener("click", () => $("camera-input").click());
    $("choose-gallery-btn").addEventListener("click", () => $("gallery-input").click());
    ["camera-input", "gallery-input"].forEach((id) =>
      $(id).addEventListener("change", (e) => e.target.files && e.target.files[0] && this.handlePhotoSelect(e.target.files[0])));
    $("read-report-btn").addEventListener("click", () => this.readReport());

    // Buttons inside rendered content
    document.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open-report]");
      if (open) this.openReport(open.dataset.openReport);
      const close = e.target.closest("[data-close]");
      if (close) this.hideModal(close.dataset.close);
      const review = e.target.closest("[data-review-action]");
      if (review) this.reviewAction(review.dataset.reviewAction, review);
      const report = e.target.closest("[data-report-action]");
      if (report) this.reportAction(report.dataset.reportAction);
    });
    ["report-modal", "doctor-modal"].forEach((id) =>
      $(id).addEventListener("click", (e) => { if (e.target.id === id) this.hideModal(id); }));
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      this.toggleMenu(false);
      this.toggleProfileMenu(false);
      ["report-modal", "doctor-modal"].forEach((id) => { if (!$(id).hidden) this.hideModal(id); });
    });

    // Ask
    $("chat-input").addEventListener("input", () => { $("chat-char-counter").textContent = `${$("chat-input").value.length}/500`; });
    $("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleChatSubmit($("chat-input").value);
    });
    document.querySelectorAll(".chip-btn").forEach((chip) =>
      chip.addEventListener("click", () => this.handleChatSubmit(chip.textContent.trim())));
    $("celebration-modal").addEventListener("click", () => $("celebration-modal").classList.remove("active"));
  }
};

document.addEventListener("DOMContentLoaded", () => BaselineApp.init());
