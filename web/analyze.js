/**
 * Quick analysis for a visitor with no account.
 *
 * One photo in, one reading out. Nothing is sent to storage, nothing is kept in this
 * browser, and no token is sent: the page holds the photo and the answer in memory only,
 * so closing the tab is all it takes to be rid of them.
 */

const Guest = {
  photoBlob: null,
  busy: false,
  result: null,   // the last answer, kept only to redraw it in another language

  init() {
    Icons.fill();
    Mascot.init();
    Mascot.say(t("analyze.lead"), "wave");
    this.bindEvents();
  },

  bindEvents() {
    $("take-photo-btn").addEventListener("click", () => $("camera-input").click());
    $("choose-gallery-btn").addEventListener("click", () => $("gallery-input").click());
    $("camera-input").addEventListener("change", (e) => this.choosePhoto(e.target.files[0]));
    $("gallery-input").addEventListener("change", (e) => this.choosePhoto(e.target.files[0]));
    $("analyze-btn").addEventListener("click", () => this.analyse());
    $("analyze-again-btn").addEventListener("click", () => this.startAgain());
    document.addEventListener("baseline:lang", () => this.onLanguageChanged());
  },

  status(message, kind = "") {
    const box = $("analyze-status");
    box.textContent = message;
    box.className = `upload-status ${kind}`;
  },

  async choosePhoto(file) {
    if (!file) return;
    this.status("");
    try {
      this.photoBlob = await shrinkImage(file);
      $("photo-preview").src = URL.createObjectURL(this.photoBlob);
      $("photo-preview-container").hidden = false;
      $("analyze-btn").disabled = false;
    } catch (err) {
      this.status(err.message, "status-error");
    }
  },

  setBusy(busy) {
    this.busy = busy;
    const btn = $("analyze-btn");
    btn.classList.toggle("btn-loading", busy);
    btn.disabled = busy || !this.photoBlob;
    btn.querySelector("span").textContent = t(busy ? "upload.reading" : "analyze.read");
  },

  async analyse() {
    if (this.busy) return;
    if (!this.photoBlob) {
      this.status(t("upload.needPhoto"), "status-error");
      return;
    }
    this.setBusy(true);
    this.status(t("analyze.mascotWaiting"), "status-loading");
    Mascot.setLoading(t("analyze.mascotWaiting"));
    try {
      const form = new FormData();
      form.append("file", this.photoBlob, "report.jpg");
      form.append("lang", I18n.lang());
      this.result = await API.analyseWithoutAccount(form);
      this.status("");
      this.render();
    } catch (err) {
      this.status(err.message, "status-error");
      Mascot.setError(err.message);
    } finally {
      this.setBusy(false);
    }
  },

  render() {
    const data = this.result;
    if (!data) return;
    $("analyze-meta").textContent = data.report_date
      ? t("analyze.reportOf", { date: formatDateDisplay(data.report_date) })
      : t("analyze.noDate");
    $("analyze-summary").textContent = data.summary || "";
    const container = $("analyze-trends");
    container.innerHTML = (data.trends || []).map(trendCardHtml).join("");
    bindCardTaps(container);
    $("analyze-upload").hidden = true;
    $("analyze-results").hidden = false;
    // A short line: the summary itself is in the card right below, and she types hers out.
    Mascot.say(t("analyze.mascot"), "pointing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  startAgain() {
    this.photoBlob = null;
    this.result = null;
    $("photo-preview").src = "";
    $("photo-preview-container").hidden = true;
    $("camera-input").value = "";
    $("gallery-input").value = "";
    $("analyze-btn").disabled = true;
    $("analyze-results").hidden = true;
    $("analyze-upload").hidden = false;
    this.status("");
    Mascot.say(t("analyze.lead"), "wave");
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  /**
   * A new language redraws every label at once. The sentences were written by the model in
   * the old language, so having them in the new one means reading the report again: the
   * mascot says so while it happens, because it takes a few seconds. If that read fails
   * (no connection, or this visitor's free readings are used up) the sentences simply stay
   * as they were and the page keeps working.
   */
  async onLanguageChanged() {
    if (!this.result || !this.photoBlob) {
      Mascot.say(t("analyze.lead"), "wave");
      return;
    }
    this.render();
    if (this.busy) return;
    this.busy = true;
    Mascot.setLoading(t("analyze.mascotWaiting"));
    try {
      const form = new FormData();
      form.append("file", this.photoBlob, "report.jpg");
      form.append("lang", I18n.lang());
      this.result = await API.analyseWithoutAccount(form);
      this.render();
    } catch (err) {
      Mascot.setError(err.message);
    } finally {
      this.busy = false;
    }
  }
};

document.addEventListener("DOMContentLoaded", () => Guest.init());
