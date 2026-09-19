/**
 * Baseline App Controller
 * Orchestrates screens B through G:
 * - People & language management (Screen B)
 * - Reminder & winding history path (Screen C)
 * - Camera capture, canvas image shrinking & upload (Screen D)
 * - Hand-drawn inline SVG trend cards (Screen E)
 * - Doctor clinical view & print layout (Screen F)
 * - AI lab report chat panel (Screen G)
 */

// Global State
const State = {
  people: [],
  currentPerson: null,
  currentLang: "en",
  trendsData: null,
  selectedPhotoBlob: null,
  isUploading: false,
  isChatting: false
};

// Date Formatter Helper ("12 Sept 2026", month names in the chosen language; the doctor view passes "en")
function formatDateDisplay(dateStr, lang = I18n.lang()) {
  return I18n.formatDate(dateStr, lang);
}

// Today formatted for Doctor view ("19 Sep 2026")
function getTodayDisplay() {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Technical Concept: Canvas Resizing
 * Canvas resizing loads the original image onto an in-memory HTML5 <canvas> element at a clamped dimension (max 2000px)
 * and re-encodes it to JPEG, drastically reducing file size before network transmission while preserving clarity.
 */
async function shrinkImage(file, maxDimension = 2000, quality = 0.88) {
  console.log(`[Canvas Resizing] Original file size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
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
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error(t("error.photo")));
              return;
            }
            console.log(
              `[Canvas Resizing] Shrunk image size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB (${width}x${height}px)`
            );
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Every distinct report date for a person, oldest first.
 * The API has no separate date list: the dates live inside each trend's history ({date, value}).
 */
function collectReportDates(data) {
  if (!data || !Array.isArray(data.trends)) return [];
  return [...new Set(data.trends.flatMap((t) => (t.history || []).map((h) => h.date)))].sort();
}

/**
 * Technical Concept: SVG Coordinate Space
 * SVG coordinates map data values to a 2D viewBox grid where (0,0) is top-left, requiring inverted Y calculations
 * so higher lab numbers visually rise upwards and lower numbers fall downwards.
 */
function createTrendSvgChart(trend) {
  const width = 280;
  const height = 72;
  const padTop = 10;
  const padBottom = 20;
  const padLeft = 32;
  const padRight = 32;

  // Contract shape: trend.history is [{date, value}], oldest first.
  const entries = Array.isArray(trend.history) && trend.history.length > 0
    ? trend.history
    : [{ date: null, value: trend.current }];
  const history = entries.map((h) => h.value);
  const dates = entries.map((h) => h.date).filter(Boolean);

  // Determine min and max scale bounds including normal reference band
  const numbers = [...history];
  if (typeof trend.ref_low === "number") numbers.push(trend.ref_low);
  if (typeof trend.ref_high === "number") numbers.push(trend.ref_high);

  let minVal = Math.min(...numbers);
  let maxVal = Math.max(...numbers);

  // Prevent divide by zero if all values are equal
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  } else {
    // Add 10% breathing room to chart top/bottom
    const range = maxVal - minVal;
    minVal -= range * 0.1;
    maxVal += range * 0.1;
  }

  // Coordinate mapping functions
  const getY = (val) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    const ratio = (clamped - minVal) / (maxVal - minVal);
    // Inverted Y: higher values have smaller Y (near top)
    return padTop + (1 - ratio) * (height - padTop - padBottom);
  };

  const getX = (index, total) => {
    if (total <= 1) return width / 2;
    return padLeft + (index / (total - 1)) * (width - padLeft - padRight);
  };

  let svgElements = "";

  // 1. Shaded Normal Range Band behind everything
  if (typeof trend.ref_low === "number" && typeof trend.ref_high === "number") {
    const bandTop = getY(trend.ref_high);
    const bandBottom = getY(trend.ref_low);
    const bandHeight = Math.max(2, bandBottom - bandTop);
    svgElements += `
      <rect x="0" y="${bandTop.toFixed(1)}" width="${width}" height="${bandHeight.toFixed(1)}"
            class="svg-band" aria-hidden="true" />
      <line x1="0" y1="${bandTop.toFixed(1)}" x2="${width}" y2="${bandTop.toFixed(1)}"
            class="svg-band-line" stroke-dasharray="3 3" aria-hidden="true" />
      <line x1="0" y1="${bandBottom.toFixed(1)}" x2="${width}" y2="${bandBottom.toFixed(1)}"
            class="svg-band-line" stroke-dasharray="3 3" aria-hidden="true" />
    `;
  }

  // 2. Trend Line through history points
  const points = history.map((val, idx) => ({
    x: getX(idx, history.length),
    y: getY(val),
    val
  }));

  if (points.length > 1) {
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    svgElements += `
      <path d="${pathD}" class="svg-line" fill="none" aria-hidden="true" />
    `;
  }

  // 3. Dots for each point (newest dot is larger)
  points.forEach((p, idx) => {
    const isLatest = idx === points.length - 1;
    const isOutOfRange = isLatest && (trend.status === "high" || trend.status === "low");
    const radius = isLatest ? 5.5 : 3.5;
    const dotClass = isOutOfRange ? "svg-dot svg-dot-out" : isLatest ? "svg-dot svg-dot-latest" : "svg-dot";

    svgElements += `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${radius}" class="${dotClass}" aria-hidden="true" />
    `;
  });

  // 4. Small date labels under first and last points
  if (dates.length > 0) {
    const firstDate = formatDateDisplay(dates[0]);
    svgElements += `
      <text x="${points[0].x.toFixed(1)}" y="${(height - 4).toFixed(1)}" text-anchor="${points.length > 1 ? "start" : "middle"}" class="svg-date-label">
        ${escapeHtml(firstDate)}
      </text>
    `;
    if (points.length > 1 && dates.length > 1) {
      const lastDate = formatDateDisplay(dates[dates.length - 1]);
      svgElements += `
        <text x="${points[points.length - 1].x.toFixed(1)}" y="${(height - 4).toFixed(1)}" text-anchor="end" class="svg-date-label">
          ${escapeHtml(lastDate)}
        </text>
      `;
    }
  }

  const chartAriaLabel = t("card.chart", { test: trend.test_name, n: history.length, value: trend.current });

  return `
    <svg viewBox="0 0 ${width} ${height}" class="trend-chart-svg" role="img" aria-label="${escapeHtml(chartAriaLabel)}">
      ${svgElements}
    </svg>
  `;
}

// Main Baseline Application Object
const BaselineApp = {
  async init() {
    // No session on this device: log in first. (An expired one is caught on the first API call.)
    if (!Auth.token()) {
      Auth.goToLogin();
      return;
    }
    const username = Auth.username() || (Auth.email() || "").split("@")[0];
    this.renderSignedIn();
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        logoutBtn.disabled = true;
        await API.logout();
        Auth.goToLogin();
      });
    }

    Mascot.init(document.getElementById("mascot-container"));
    if (username) Mascot.say(t("mascot.hiLoading", { name: username }), "wave");
    document.addEventListener("baseline:lang", (e) => this.onLanguageChanged(e.detail));
    this.bindEvents();
    this.loadSavedLanguage();
    await this.loadPeople();
  },

  /** "Signed in as <b>name</b>", with the name in bold whatever the word order of the language. */
  renderSignedIn() {
    const el = document.getElementById("account-signed-in");
    if (!el) return;
    const name = Auth.username() || (Auth.email() || "").split("@")[0];
    const [before, after = ""] = t("app.signedIn", { name: "\u0000" }).split("\u0000");
    const strong = document.createElement("strong");
    strong.textContent = name;
    strong.title = Auth.email() || "";
    el.replaceChildren(before, strong, after);
  },

  /** Language switched (here or on another page): redraw everything this script wrote itself. */
  onLanguageChanged(lang) {
    State.currentLang = lang;
    const langSelect = document.getElementById("lang-select");
    if (langSelect) langSelect.value = lang;
    this.renderSignedIn();
    this.renderPeopleDropdown();
    if (State.currentPerson) {
      this.loadTrends();   // summaries come back from the server in the new language
    } else {
      Mascot.evaluateState(null, null);
    }
  },

  loadSavedLanguage() {
    State.currentLang = I18n.lang();
    const langSelect = document.getElementById("lang-select");
    if (langSelect) langSelect.value = State.currentLang;
    document.documentElement.lang = State.currentLang;
  },

  async loadPeople() {
    try {
      const response = await API.getPeople();
      State.people = response.people || [];

      // Determine active person: the one remembered on this device, else the first in the list
      let savedPersonId = null;
      try {
        savedPersonId = localStorage.getItem("baseline_person_id");
      } catch (e) {
        console.warn("localStorage unavailable:", e);
      }

      State.currentPerson = State.people.find((p) => p.person_id === savedPersonId) || State.people[0];

      this.renderPeopleDropdown();
      if (State.currentPerson) {
        await this.loadTrends();
      } else {
        Mascot.evaluateState(null, null);
      }
    } catch (err) {
      Mascot.setError(err.message);
      this.showToast(err.message, "error");
    }
  },

  renderPeopleDropdown() {
    const select = document.getElementById("person-select");
    if (!select) return;

    select.innerHTML = "";
    const addBtn = document.getElementById("open-add-person-btn");
    if (State.people.length === 0) {
      // Nobody yet: say so in the dropdown and draw attention to "+ Add person".
      const option = document.createElement("option");
      option.value = "";
      option.textContent = t("app.noOne");
      option.disabled = true;
      option.selected = true;
      select.appendChild(option);
      if (addBtn) addBtn.classList.add("needs-attention");
    } else if (addBtn) {
      addBtn.classList.remove("needs-attention");
    }
    State.people.forEach((person) => {
      const option = document.createElement("option");
      option.value = person.person_id;
      option.textContent = person.is_self ? t("app.myself", { name: person.display_name }) : person.display_name;
      if (State.currentPerson && person.person_id === State.currentPerson.person_id) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // Update Add Person modal "This is me" checkbox visibility
    const isSelfExists = State.people.some((p) => p.is_self);
    const selfCheckboxContainer = document.getElementById("self-checkbox-container");
    if (selfCheckboxContainer) {
      selfCheckboxContainer.style.display = isSelfExists ? "none" : "flex";
      const chk = document.getElementById("new-person-self");
      if (chk && isSelfExists) chk.checked = false;
    }
  },

  async selectPerson(personId) {
    if (State.isUploading) {
      this.showToast(t("upload.inProgress"), "info");
      // Revert select dropdown value back to current person
      const select = document.getElementById("person-select");
      if (select && State.currentPerson) select.value = State.currentPerson.person_id;
      return;
    }
    const person = State.people.find((p) => p.person_id === personId);
    if (!person) return;


    State.currentPerson = person;
    try {
      localStorage.setItem("baseline_person_id", person.person_id);
    } catch (e) {
      console.warn("localStorage write failed:", e);
    }

    this.renderPeopleDropdown();
    await this.loadTrends();
  },

  setLanguage(lang) {
    I18n.setLang(lang);   // redraws static text and fires "baseline:lang" -> onLanguageChanged
  },

  async loadTrends() {
    if (!State.currentPerson) return;

    const trendsContainer = document.getElementById("trends-container");
    if (trendsContainer) {
      trendsContainer.innerHTML = `
        <div class="card loading-card" role="status">
          <p>${escapeHtml(t("trends.loading"))}</p>
        </div>
      `;
    }

    try {
      const data = await API.getTrends(State.currentPerson.person_id, State.currentLang);
      State.trendsData = data;

      this.renderReminderAndPath(data);
      this.renderTrendCards(data);
      Mascot.evaluateState(State.currentPerson, data);
    } catch (err) {
      if (trendsContainer) {
        trendsContainer.innerHTML = `
          <div class="card error-card" role="alert">
            <p>${escapeHtml(err.message)}</p>
          </div>
        `;
      }
      Mascot.setError(err.message);
    }
  },

  /**
   * Screen C: History Path & Reminder
   */
  renderReminderAndPath(data) {
    const section = document.getElementById("reminder-path-section");
    if (!section) return;

    const hasReminder = data && data.reminder;
    const historyDates = collectReportDates(data);

    if (!hasReminder && historyDates.length === 0) {
      section.style.display = "none";
      section.innerHTML = "";
      return;
    }

    section.style.display = "block";

    let nodesHtml = "";
    // Historical report date nodes
    historyDates.forEach((dateStr, idx) => {
      nodesHtml += `
        <div class="path-node past-node">
          <div class="node-circle" title="${escapeHtml(t("path.reportDate"))}">
            <span class="node-icon">📄</span>
          </div>
          <span class="node-date">${escapeHtml(formatDateDisplay(dateStr))}</span>
        </div>
        <div class="path-connector" aria-hidden="true"></div>
      `;
    });

    // Next Due node
    if (hasReminder && data.reminder.next_due) {
      const isOverdue = Boolean(data.reminder.overdue);
      const dueFormatted = formatDateDisplay(data.reminder.next_due);
      nodesHtml += `
        <div class="path-node locked-node ${isOverdue ? "overdue-node" : ""}">
          <div class="node-circle" title="${escapeHtml(t(isOverdue ? "path.overdueTitle" : "path.nextTitle"))}">
            <span class="node-icon">${isOverdue ? "⚠️" : "🔒"}</span>
          </div>
          <span class="node-label">${escapeHtml(t(isOverdue ? "path.overdue" : "path.next"))}</span>
          <span class="node-date">${escapeHtml(dueFormatted)}</span>
        </div>
      `;
    }

    section.innerHTML = `
      <div class="card history-path-card">
        <h3 class="path-heading">${escapeHtml(t("path.heading"))}</h3>
        <div class="history-path-track" role="list">
          ${nodesHtml}
        </div>
      </div>
    `;
  },

  /**
   * Screen E: Trend Cards
   */
  renderTrendCards(data) {
    const container = document.getElementById("trends-container");
    if (!container) return;

    if (!data || !Array.isArray(data.trends) || data.trends.length === 0) {
      container.innerHTML = `
        <div class="card empty-trends-card">
          <div class="empty-icon">📋</div>
          <h3>${escapeHtml(t("trends.emptyTitle"))}</h3>
          <p>${escapeHtml(t("trends.emptyText"))}</p>
        </div>
      `;
      return;
    }

    let cardsHtml = "";
    data.trends.forEach((trend, idx) => {
      const isHigh = trend.status === "high";
      const isLow = trend.status === "low";
      const isOutOfRange = isHigh || isLow;

      // Direction Arrow
      let arrowChar = "";
      if (trend.direction === "rising") arrowChar = "↑";
      else if (trend.direction === "falling") arrowChar = "↓";
      else if (trend.direction === "stable") arrowChar = "→";

      // Badge
      let badgeHtml = "";
      if (isHigh) {
        badgeHtml = `<span class="status-badge badge-high" aria-label="${escapeHtml(t("card.high"))}">H</span>`;
      } else if (isLow) {
        badgeHtml = `<span class="status-badge badge-low" aria-label="${escapeHtml(t("card.low"))}">L</span>`;
      }

      // Normal Range Text
      const limits = { low: trend.ref_low, high: trend.ref_high, unit: trend.unit };
      let rangeText = t("range.none");
      if (typeof trend.ref_low === "number" && typeof trend.ref_high === "number") {
        rangeText = t("range.both", limits);
      } else if (typeof trend.ref_high === "number") {
        rangeText = t("range.below", limits);
      } else if (typeof trend.ref_low === "number") {
        rangeText = t("range.above", limits);
      }

      // SVG Chart
      const chartHtml = createTrendSvgChart(trend);

      // Brief highlight on updated
      const updatedClass = trend.updated ? "trend-card-updated" : "";

      cardsHtml += `
        <article class="card trend-card ${isOutOfRange ? "card-out-of-range" : ""} ${updatedClass}"
                 tabindex="0"
                 role="button"
                 aria-label="${escapeHtml(t("card.tap", { test: trend.test_name }))}"
                 data-summary="${escapeHtml(trend.summary)}">
          <div class="trend-card-header">
            <div class="test-title-group">
              <h3 class="test-name">${escapeHtml(trend.test_name)}</h3>
              ${badgeHtml}
            </div>
            <div class="test-value-group ${isOutOfRange ? "value-danger" : ""}">
              <span class="test-value">${escapeHtml(trend.current)}</span>
              <span class="test-unit">${escapeHtml(trend.unit)}</span>
              ${arrowChar ? `<span class="trend-arrow" aria-label="${escapeHtml(t("dir." + trend.direction))}">${arrowChar}</span>` : ""}
            </div>
          </div>

          <div class="trend-chart-wrapper">
            ${chartHtml}
          </div>

          <div class="trend-card-footer">
            <span class="range-info">${escapeHtml(rangeText)}</span>
            <p class="trend-summary">${escapeHtml(trend.summary)}</p>
          </div>
        </article>
      `;
    });

    container.innerHTML = cardsHtml;

    // Tapping a card makes the mascot speak the summary
    container.querySelectorAll(".trend-card").forEach((card) => {
      const speakSummary = () => {
        const summary = card.getAttribute("data-summary");
        if (summary) {
          Mascot.say(summary, "pointing", { temporary: true });
        }
      };
      card.addEventListener("click", speakSummary);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          speakSummary();
        }
      });
    });
  },

  /**
   * Screen D: Handle Photo Selection & Compression
   */
  async handlePhotoSelect(file) {
    if (!file) return;

    const previewContainer = document.getElementById("photo-preview-container");
    const previewImg = document.getElementById("photo-preview");
    const readBtn = document.getElementById("read-report-btn");
    const uploadStatus = document.getElementById("upload-status");

    uploadStatus.textContent = "";
    uploadStatus.className = "upload-status";

    try {
      const shrunkBlob = await shrinkImage(file, 2000, 0.88);
      State.selectedPhotoBlob = shrunkBlob;

      const previewUrl = URL.createObjectURL(shrunkBlob);
      previewImg.src = previewUrl;
      previewContainer.style.display = "block";
      readBtn.disabled = false;
    } catch (err) {
      this.showToast(err.message, "error");
      uploadStatus.textContent = err.message;
      uploadStatus.className = "upload-status status-error";
    }
  },

  /**
   * Screen D: Upload Report
   */
  async submitReport() {
    if (State.isUploading) return;
    const readBtn = document.getElementById("read-report-btn");
    const uploadStatus = document.getElementById("upload-status");
    const customDateInput = document.getElementById("custom-report-date");

    // Never fail silently: say what's missing.
    const missing = !State.currentPerson
      ? t("upload.needPerson")
      : !State.selectedPhotoBlob
        ? t("upload.needPhoto")
        : null;
    if (missing) {
      uploadStatus.textContent = missing;
      uploadStatus.className = "upload-status status-error";
      Mascot.say(missing, "shrug");
      return;
    }

    State.isUploading = true;
    readBtn.disabled = true;
    readBtn.classList.add("btn-loading");
    readBtn.textContent = t("upload.reading");

    // Technical Concept: aria-live
    // aria-live="polite" notifies screen readers of progressive background state changes without interrupting current speech.
    uploadStatus.textContent = t("upload.readingReport");
    uploadStatus.className = "upload-status status-loading";
    Mascot.setLoading(t("upload.readingReport"));

    // Progressive status update after 3 seconds per Part 7 Screen D
    const distinctDatesCount = collectReportDates(State.trendsData).length;

    const progressTimer = setTimeout(() => {
      if (State.isUploading) {
        const msg = t("upload.comparing", { n: distinctDatesCount });
        uploadStatus.textContent = msg;
        Mascot.setLoading(msg);
      }
    }, 3000);

    try {
      const formData = new FormData();
      formData.append("person_id", State.currentPerson.person_id);
      formData.append("file", State.selectedPhotoBlob, "report.jpg");
      if (customDateInput && customDateInput.value) {
        formData.append("report_date", customDateInput.value);
      }
      formData.append("lang", State.currentLang);

      const result = await API.uploadReport(formData);
      clearTimeout(progressTimer);

      State.trendsData = result;
      this.renderReminderAndPath(result);
      this.renderTrendCards(result);

      // Part 6 Celebration Habit:
      // Small celebration when a report is ADDED ("Report added to Mrs Sunita Rao's history").
      const addedTitle = State.currentPerson.is_self
        ? t("celebrate.self")
        : t("celebrate.other", { name: State.currentPerson.display_name });
      const trendCount = result.trends ? result.trends.filter((tr) => tr.updated).length : 0;
      const successMsg = result.report && result.report.report_date
        ? t("upload.added", { n: trendCount, date: formatDateDisplay(result.report.report_date) })
        : t("upload.addedNoDate", { n: trendCount });

      this.triggerCelebration(addedTitle, successMsg);
      const anyOutOfRange = (result.trends || []).some((tr) => tr.status === "high" || tr.status === "low");
      Mascot.say(`${addedTitle} ${successMsg}`, anyOutOfRange ? "pointing" : "celebrate");

      // Reset photo state
      this.clearPhotoSelection();
      uploadStatus.textContent = successMsg;
      uploadStatus.className = "upload-status status-success";
    } catch (err) {
      clearTimeout(progressTimer);
      uploadStatus.textContent = err.message;
      uploadStatus.className = "upload-status status-error";
      Mascot.setError(err.message);
      // Keep photo selected so user can retry per Part 7 Screen D
      readBtn.disabled = false;
    } finally {
      State.isUploading = false;
      readBtn.classList.remove("btn-loading");
      readBtn.textContent = t("upload.read");
    }
  },

  clearPhotoSelection() {
    State.selectedPhotoBlob = null;
    const previewContainer = document.getElementById("photo-preview-container");
    const previewImg = document.getElementById("photo-preview");
    const readBtn = document.getElementById("read-report-btn");
    const cameraInput = document.getElementById("camera-input");
    const galleryInput = document.getElementById("gallery-input");
    const customDateInput = document.getElementById("custom-report-date");

    if (previewContainer) previewContainer.style.display = "none";
    if (previewImg) previewImg.src = "";
    if (readBtn) readBtn.disabled = true;
    if (cameraInput) cameraInput.value = "";
    if (galleryInput) galleryInput.value = "";
    if (customDateInput) customDateInput.value = "";
  },

  /**
   * Habit Celebration Visual (Duolingo-inspired pop)
   */
  triggerCelebration(title, subtitle) {
    const modal = document.getElementById("celebration-modal");
    if (!modal) return;

    modal.querySelector(".celebration-title").textContent = title;
    modal.querySelector(".celebration-subtitle").textContent = subtitle;
    modal.classList.add("active");

    setTimeout(() => {
      modal.classList.remove("active");
    }, 4000);
  },

  /**
   * Screen F: Doctor View
   */
  async openDoctorView() {
    if (!State.currentPerson) return;

    const modal = document.getElementById("doctor-modal");
    const content = document.getElementById("doctor-modal-content");
    if (!modal || !content) return;

    content.innerHTML = `<p class="clinical-loading">Generating clinical report for ${escapeHtml(State.currentPerson.display_name)}...</p>`;
    modal.style.display = "flex";
    document.body.classList.add("modal-open");

    // Mascot hidden on doctor screen per Part 6
    Mascot.hide();

    try {
      const docData = await API.getDoctorView(State.currentPerson.person_id);
      this.renderDoctorViewContent(docData);
    } catch (err) {
      content.innerHTML = `<p class="clinical-error">${escapeHtml(err.message)}</p>`;
    }
  },

  renderDoctorViewContent(docData) {
    const content = document.getElementById("doctor-modal-content");
    if (!content) return;

    const reportDatesStr = (docData.report_dates && docData.report_dates.length > 0)
      ? docData.report_dates.map((d) => formatDateDisplay(d, "en")).join(", ")
      : "None";

    let tablesHtml = "";
    if (docData.tests && docData.tests.length > 0) {
      docData.tests.forEach((t) => {
        let rowsHtml = "";
        (t.results || []).forEach((r) => {
          const isFlagged = r.flag === "H" || r.flag === "L";
          const flagDisplay = isFlagged ? `<strong>${escapeHtml(r.flag)}</strong>` : "";
          const refRangeDisplay = (typeof r.ref_low === "number" && typeof r.ref_high === "number")
            ? `${r.ref_low}–${r.ref_high}`
            : (typeof r.ref_high === "number" ? `< ${r.ref_high}` : (typeof r.ref_low === "number" ? `> ${r.ref_low}` : "—"));

          rowsHtml += `
            <tr class="${isFlagged ? "flagged-row" : ""}">
              <td>${escapeHtml(formatDateDisplay(r.date, "en"))}</td>
              <td>${escapeHtml(r.value)}</td>
              <td>${escapeHtml(r.unit || t.unit)}</td>
              <td>${escapeHtml(refRangeDisplay)}</td>
              <td class="flag-cell">${flagDisplay}</td>
            </tr>
          `;
        });

        tablesHtml += `
          <div class="clinical-table-wrapper">
            <h3 class="clinical-test-title">${escapeHtml(t.test_name)}</h3>
            <table class="clinical-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Result</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Reference Range</th>
                  <th scope="col">Flag</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `;
      });
    } else {
      tablesHtml = `<p class="clinical-empty">No clinical records found for this person.</p>`;
    }

    content.innerHTML = `
      <div class="clinical-header">
        <h2 class="clinical-main-title">Baseline - Lab History for ${escapeHtml(State.currentPerson.display_name)}</h2>
        <p class="clinical-dates">Report dates: ${escapeHtml(reportDatesStr)}</p>
        <p class="clinical-meta">Generated: ${escapeHtml(getTodayDisplay())}</p>
      </div>

      <div class="clinical-actions no-print">
        <button id="print-doctor-btn" class="btn btn-primary">🖨️ Print Clinical Report</button>
        <button id="close-doctor-btn" class="btn btn-secondary">← Back to Cards</button>
      </div>

      <div class="clinical-tables-container">
        ${tablesHtml}
      </div>
    `;

    document.getElementById("print-doctor-btn").addEventListener("click", () => window.print());
    document.getElementById("close-doctor-btn").addEventListener("click", () => this.closeDoctorView());
  },

  closeDoctorView() {
    const modal = document.getElementById("doctor-modal");
    if (modal) modal.style.display = "none";
    document.body.classList.remove("modal-open");
    Mascot.show();
    Mascot.restoreDefault();
  },

  /**
   * Screen G: Chat Panel
   */
  async handleChatSubmit(questionText) {
    const q = (questionText || "").trim();
    if (!q || State.isChatting || !State.currentPerson) return;

    State.isChatting = true;
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const charCounter = document.getElementById("chat-char-counter");
    const messagesContainer = document.getElementById("chat-messages");

    chatInput.value = "";
    if (charCounter) charCounter.textContent = "0/500";
    sendBtn.disabled = true;

    // 1. Append user message bubble
    const userBubble = document.createElement("div");
    userBubble.className = "chat-bubble user-bubble";
    userBubble.textContent = q;
    messagesContainer.appendChild(userBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 2. Append thinking bubble + Mascot reading pose
    const thinkingBubble = document.createElement("div");
    thinkingBubble.className = "chat-bubble mascot-bubble mascot-thinking";
    thinkingBubble.textContent = t("chat.thinking");
    messagesContainer.appendChild(thinkingBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    Mascot.setChatWaiting();

    try {
      const response = await API.askChat(State.currentPerson.person_id, q, State.currentLang);
      thinkingBubble.remove();

      // Append reply bubble
      const replyBubble = document.createElement("div");
      replyBubble.className = "chat-bubble mascot-reply-bubble";
      replyBubble.textContent = I18n.server(response.reply);
      messagesContainer.appendChild(replyBubble);

      Mascot.say(I18n.server(response.reply), "pointing", { temporary: true });
    } catch (err) {
      thinkingBubble.remove();
      const errBubble = document.createElement("div");
      errBubble.className = "chat-bubble chat-error-bubble";
      errBubble.innerHTML = escapeHtml(err.message);
      messagesContainer.appendChild(errBubble);

      Mascot.setError(err.message);
    } finally {
      State.isChatting = false;
      sendBtn.disabled = false;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  },

  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `app-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("toast-show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("toast-show");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  bindEvents() {
    // Person select change
    const personSelect = document.getElementById("person-select");
    if (personSelect) {
      personSelect.addEventListener("change", (e) => this.selectPerson(e.target.value));
    }

    // Language select change
    const langSelect = document.getElementById("lang-select");
    if (langSelect) {
      langSelect.addEventListener("change", (e) => this.setLanguage(e.target.value));
    }

    // Add Person modal open/close
    const openAddPersonBtn = document.getElementById("open-add-person-btn");
    const closeAddPersonBtn = document.getElementById("close-add-person-btn");
    const addPersonModal = document.getElementById("add-person-modal");
    const addPersonForm = document.getElementById("add-person-form");

    if (openAddPersonBtn && addPersonModal) {
      openAddPersonBtn.addEventListener("click", () => {
        addPersonModal.style.display = "flex";
        document.getElementById("add-person-error").textContent = "";
        document.getElementById("new-person-name").focus();
      });
    }

    if (closeAddPersonBtn && addPersonModal) {
      closeAddPersonBtn.addEventListener("click", () => {
        addPersonModal.style.display = "none";
      });
    }

    if (addPersonForm) {
      addPersonForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errContainer = document.getElementById("add-person-error");
        errContainer.textContent = "";

        const title = document.getElementById("new-person-title").value;
        const name = document.getElementById("new-person-name").value;
        const isSelf = document.getElementById("new-person-self").checked;

        try {
          const newPerson = await API.addPerson({ title, name, is_self: isSelf });
          State.people.push(newPerson);
          addPersonModal.style.display = "none";
          addPersonForm.reset();
          await this.selectPerson(newPerson.person_id);
          this.showToast(t("person.added", { name: newPerson.display_name }), "success");
        } catch (err) {
          errContainer.textContent = err.message;
        }
      });
    }

    // Photo input triggers
    const takePhotoBtn = document.getElementById("take-photo-btn");
    const chooseGalleryBtn = document.getElementById("choose-gallery-btn");
    const cameraInput = document.getElementById("camera-input");
    const galleryInput = document.getElementById("gallery-input");
    const readBtn = document.getElementById("read-report-btn");

    if (takePhotoBtn && cameraInput) {
      takePhotoBtn.addEventListener("click", () => cameraInput.click());
      cameraInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) this.handlePhotoSelect(e.target.files[0]);
      });
    }

    if (chooseGalleryBtn && galleryInput) {
      chooseGalleryBtn.addEventListener("click", () => galleryInput.click());
      galleryInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) this.handlePhotoSelect(e.target.files[0]);
      });
    }

    if (readBtn) {
      readBtn.addEventListener("click", () => this.submitReport());
    }

    // Doctor View button
    const doctorBtn = document.getElementById("doctor-view-btn");
    if (doctorBtn) {
      doctorBtn.addEventListener("click", () => this.openDoctorView());
    }

    // Chat form and chips
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const charCounter = document.getElementById("chat-char-counter");

    if (chatInput && charCounter) {
      chatInput.addEventListener("input", () => {
        charCounter.textContent = `${chatInput.value.length}/500`;
      });
    }

    if (chatForm && chatInput) {
      chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleChatSubmit(chatInput.value);
      });
    }

    // Tap-to-send prompt chips
    document.querySelectorAll(".chip-btn").forEach((chip) => {
      chip.addEventListener("click", () => {
        const prompt = chip.getAttribute("data-prompt") || chip.textContent.trim();
        this.handleChatSubmit(prompt);
      });
    });

    // Celebration modal dismiss
    const celebrationModal = document.getElementById("celebration-modal");
    if (celebrationModal) {
      celebrationModal.addEventListener("click", () => {
        celebrationModal.classList.remove("active");
      });
    }
  }
};

// Start application when DOM is ready
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    BaselineApp.init();
  });
}
