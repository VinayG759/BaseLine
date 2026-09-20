/**
 * Shared page helpers: the pieces that draw a result.
 *
 * Used by app.js (the signed-in app) and analyze.js (the quick analysis for visitors
 * with no account), so a result card looks and reads the same on both pages.
 * Needs i18n.js and icons.js before it; bindCardTaps also needs mascot.js.
 */

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

/**
 * Verifies whether an uploaded image has the visual and structural characteristics
 * of a printed medical lab report (paper background, dark text lines, low saturation)
 * vs a non-medical photo (selfie, scenery, food, object, vibrant graphic).
 */
async function isLikelyMedicalReport(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve({ isMedical: false });
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ isMedical: false });
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const sampleSize = 120;
        const canvas = document.createElement("canvas");
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

        let paperPixels = 0;
        let darkInkPixels = 0;
        let highSaturationPixels = 0;
        let totalLuminance = 0;
        const totalPixels = sampleSize * sampleSize;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const delta = max - min;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          totalLuminance += lum;

          const sat = max === 0 ? 0 : delta / max;

          // Saturated colors (natural scenes, faces, clothes, food, graphics)
          if (sat > 0.28 && lum > 35 && lum < 225) {
            highSaturationPixels++;
          }

          // Paper document background (light, neutral white/gray)
          if (lum > 140 && sat < 0.24) {
            paperPixels++;
          }

          // Dark printed ink / table borders / text
          if (lum < 115) {
            darkInkPixels++;
          }
        }

        const avgLuminance = totalLuminance / totalPixels;
        const paperRatio = paperPixels / totalPixels;
        const saturationRatio = highSaturationPixels / totalPixels;
        const darkInkRatio = darkInkPixels / totalPixels;

        // Medical report validation criteria
        const isDocBackground = paperRatio > 0.35 || (avgLuminance > 135 && saturationRatio < 0.24);
        const notOverlySaturated = saturationRatio < 0.26;
        const hasTextInk = darkInkRatio > 0.015;
        const notPitchDark = avgLuminance > 75;

        const isMedical = isDocBackground && notOverlySaturated && hasTextInk && notPitchDark;

        resolve({
          isMedical,
          paperRatio,
          saturationRatio,
          darkInkRatio,
          avgLuminance
        });
      } catch (err) {
        resolve({ isMedical: true });
      }
    };
    img.src = url;
  });
}

/** Every distinct report date for a person, oldest first (the dates live inside each trend's history). */
function collectReportDates(data) {
  if (!data || !Array.isArray(data.trends)) return [];
  return [...new Set(data.trends.flatMap((tr) => (tr.history || []).map((h) => h.date)))].sort();
}

// ---------- Result visuals ----------

/** "0.8 % above the upper limit" and friends. The arithmetic is done here, from the printed numbers. */
function differenceText(value, low, high, unit, status) {
  if (status === "high" && typeof high === "number") return t("diff.above", { diff: difference(value, high), unit });
  if (status === "low" && typeof low === "number") return t("diff.below", { diff: difference(low, value), unit });
  if (status === "normal") return t("diff.inside");
  return t("diff.noRange");
}

/**
 * The change since the report before, in plain words: "Up 11 mg/dL since 8 Aug (98 to 109)".
 *
 * The arithmetic happens here, on the numbers printed on the reports, never in the model.
 */
function comparisonText(trend) {
  const history = trend.history || [];
  if (history.length < 2) return t("compare.first");
  const before = history[history.length - 2];
  const now = history[history.length - 1];
  const params = {
    diff: Math.abs(difference(now.value, before.value)),
    unit: trend.unit,
    date: formatDateDisplay(before.date),
    from: before.value,
    to: now.value
  };
  if (now.value > before.value) return t("compare.up", params);
  if (now.value < before.value) return t("compare.down", params);
  return t("compare.same", params);
}

/** Which side of the printed range one value falls on. */
function valueStatus(value, low, high) {
  const hasLow = typeof low === "number";
  const hasHigh = typeof high === "number";
  if (hasHigh && value > high) return "high";
  if (hasLow && value < low) return "low";
  return hasLow || hasHigh ? "normal" : "unknown";
}

/**
 * One upright bar per report, so a rising number is visible without reading anything.
 *
 * The shaded band behind the bars is the normal range, and every bar carries its own number,
 * because the scale starts at the smallest value on show rather than at zero: that is what
 * makes a move from 5.6 to 6.1 visible at all, but it means bar heights must not be compared
 * as if they were areas.
 */
function comparisonChartHtml(trend) {
  const history = (trend.history || []).slice(-6);
  if (history.length === 0) return "";
  const bounds = history.map((h) => h.value);
  if (typeof trend.ref_low === "number") bounds.push(trend.ref_low);
  if (typeof trend.ref_high === "number") bounds.push(trend.ref_high);
  let min = Math.min(...bounds);
  let max = Math.max(...bounds);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.18;
  max += span * 0.14;
  const pct = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));

  let band = "";
  if (typeof trend.ref_low === "number" || typeof trend.ref_high === "number") {
    const top = typeof trend.ref_high === "number" ? pct(trend.ref_high) : 100;
    const bottom = typeof trend.ref_low === "number" ? pct(trend.ref_low) : 0;
    band = `<div class="bc-band" style="bottom:${bottom.toFixed(1)}%;height:${Math.max(1, top - bottom).toFixed(1)}%"></div>`;
  }
  // A line straight across at each printed limit, labelled, so "normal" is a place on the chart.
  const limitLine = (value, which) => `
    <div class="bc-limit bc-limit-${which}" style="bottom:${pct(value).toFixed(1)}%">
      <span class="bc-limit-value">${esc(value)}</span>
    </div>`;
  const lines = [
    typeof trend.ref_high === "number" ? limitLine(trend.ref_high, "high") : "",
    typeof trend.ref_low === "number" ? limitLine(trend.ref_low, "low") : ""
  ].join("");

  // Bar, value label and band all measure from the bottom of the same box, so a bar that
  // clears the shaded band really is a value above the normal range.
  const bars = history.map((entry, index) => {
    const latest = index === history.length - 1;
    const state = valueStatus(entry.value, trend.ref_low, trend.ref_high);
    const height = Math.max(3, pct(entry.value)).toFixed(1);
    return `
      <div class="bc-col${latest ? " bc-col-latest" : ""}">
        <span class="bc-value" style="bottom:${height}%">${esc(entry.value)}</span>
        <div class="bc-bar bc-${esc(state)}" style="height:${height}%"></div>
        <span class="bc-date">${esc(entry.date ? I18n.formatDateShort(entry.date) : "")}</span>
      </div>`;
  }).join("");

  const label = t("chart.barsLabel", { test: trend.test_name, n: history.length, value: trend.current, unit: trend.unit });
  return `
    <figure class="bar-compare" role="img" aria-label="${esc(label)}">
      <div class="bc-plot">${band}${lines}<div class="bc-cols">${bars}</div></div>
      <figcaption class="bc-caption">${esc(t("chart.eachBar"))}</figcaption>
    </figure>`;
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
  const compared = (trend.history || []).length > 1;
  // The change since last time, said once in words and once as bars.
  const comparison = `
    <div class="tc-compare tc-compare-${esc(compared ? trend.direction || "stable" : "first")}">
      <span class="tc-compare-label">${esc(t("compare.title"))}</span>
      <p class="tc-compare-text">${esc(comparisonText(trend))}</p>
    </div>`;
  // Every test gets bars, a single report included: one bar against the normal lines still
  // shows where the value sits. Shown straight away — it is the point of the card, not an extra.
  const history = comparisonChartHtml(trend);
  // Once the comparison block says "up 11 since March", the written sentence repeats it.
  // It is kept only when it carries something the block doesn't: a run of moves the same
  // way, or the explanation of a first, uncompared result.
  const worthSaying = !compared || (trend.streak || 0) >= 2;
  const written = worthSaying ? `<p class="trend-summary">${esc(trend.summary)}</p>` : "";
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
      <p class="tc-diff tc-diff-${esc(status)}">${esc(differenceText(trend.current, trend.ref_low, trend.ref_high, trend.unit, status))}</p>
      ${comparison}
      ${history}
      ${written}
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

/**
 * Duolingo-style celebration confetti burst using HTML5 Canvas.
 * Self-contained, lightweight, automatically cleans up after 2.5s.
 */
function launchConfetti() {
  if (typeof window === "undefined" || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const width = (canvas.width = window.innerWidth);
  const height = (canvas.height = window.innerHeight);

  const colors = ["#58cc02", "#1cb0f6", "#ff4b4b", "#ff9600", "#ce82ff", "#ffd700", "#2dd4bf"];
  const count = 70;
  const particles = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: width * (0.35 + Math.random() * 0.3),
      y: height * 0.5,
      w: 8 + Math.random() * 8,
      h: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 16,
      vy: -10 - Math.random() * 12,
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 14,
      gravity: 0.42,
      opacity: 1
    });
  }

  let animationFrame;
  const startTime = Date.now();

  function render() {
    ctx.clearRect(0, 0, width, height);
    const elapsed = Date.now() - startTime;
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.98;
      p.rotation += p.vRotation;
      if (elapsed > 1600) {
        p.opacity = Math.max(0, p.opacity - 0.03);
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (elapsed < 2400) {
      animationFrame = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(animationFrame);
      canvas.remove();
    }
  }

  animationFrame = requestAnimationFrame(render);
}
