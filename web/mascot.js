/**
 * Baseline Mascot Controller
 * Manages Dr. Bindu's poses, speech bubbles, and behavioral reactions.
 * Rule: Mascot only echoes API data, fixed lines, or error sentences.
 * Never gives diagnostic opinions.
 */

const Mascot = (() => {
  let mascotContainer = null;
  let speechBubble = null;
  let mascotImg = null;
  let currentPose = "wave";
  let lastEvaluatedPose = "wave";
  let lastEvaluatedLine = "";

  const POSES = {
    wave: "mascot/wave.svg",
    reading: "mascot/reading.svg",
    pointing: "mascot/pointing.svg",
    smile: "mascot/smile.svg",
    calendar: "mascot/calendar.svg",
    shrug: "mascot/shrug.svg"
  };

  /**
   * Format a date string like "2026-11-06" to "6 Nov 2026"
   */
  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${day} ${months[monthIndex]} ${year}`;
      }
    } catch {
      // fallback
    }
    return dateStr;
  }

  return {
    /**
     * Initializes the mascot DOM references
     */
    init(container) {
      mascotContainer = container || document.getElementById("mascot-container");
      if (!mascotContainer) return;

      speechBubble = mascotContainer.querySelector(".mascot-bubble");
      mascotImg = mascotContainer.querySelector(".mascot-avatar");
    },

    /**
     * Directly set pose and speech text
     * @param {string} pose - 'wave'|'reading'|'pointing'|'smile'|'calendar'|'shrug'
     * @param {string} text - Message text (escaped HTML)
     */
    say(text, pose = "wave") {
      if (!mascotContainer || !speechBubble || !mascotImg) return;

      currentPose = pose;
      mascotImg.src = POSES[pose] || POSES.wave;
      mascotImg.alt = `${CONFIG.mascotName || "Doctor mascot"} ${pose} pose`;
      
      // Remove previous pose classes and add active pose class
      Object.keys(POSES).forEach((p) => mascotContainer.classList.remove(`pose-${p}`));
      mascotContainer.classList.add(`pose-${pose}`);

      // Update speech bubble text with aria-live="polite"
      speechBubble.innerHTML = escapeHtml(text);
      speechBubble.classList.remove("pop");
      void speechBubble.offsetWidth; // trigger reflow for bouncy pop micro-animation
      speechBubble.classList.add("pop");

      this.show();
    },

    /**
     * Evaluate the person and trends data to set the appropriate mascot state
     * Following Part 6 Mascot pose table:
     * - No trends -> wave: "Let's start <name>'s history. Add the latest lab report."
     * - reminder.overdue -> calendar: "The next test was due on <date>."
     * - any trend high or low -> pointing: "N results are outside the normal range. Worth discussing with a doctor."
     * - all trends normal -> smile: "All results are within the normal range."
     */
    evaluateState(person, trendsData) {
      if (!person) {
        const name = (typeof Auth !== "undefined" && Auth.username()) || "there";
        this.say(`Hi ${name}! Let's begin: tap "+ Add person" to add yourself or a family member.`, "wave");
        return;
      }

      const namePhrase = person.is_self ? "your" : `${person.display_name}'s`;

      // 1. Person has no trends
      if (!trendsData || !Array.isArray(trendsData.trends) || trendsData.trends.length === 0) {
        const line = `Let's start ${namePhrase} history. Add the latest lab report.`;
        lastEvaluatedPose = "wave";
        lastEvaluatedLine = line;
        this.say(line, "wave");
        return;
      }

      // 2. Overdue reminder
      if (trendsData.reminder && trendsData.reminder.overdue && trendsData.reminder.next_due) {
        const formattedDue = formatDate(trendsData.reminder.next_due);
        const line = `The next test was due on ${formattedDue}.`;
        lastEvaluatedPose = "calendar";
        lastEvaluatedLine = line;
        this.say(line, "calendar");
        return;
      }

      // 3. Count high / low trends
      const outOfRangeCount = trendsData.trends.filter(
        (t) => t.status === "high" || t.status === "low"
      ).length;

      if (outOfRangeCount > 0) {
        const resultWord = outOfRangeCount === 1 ? "result is" : "results are";
        const line = `${outOfRangeCount} ${resultWord} outside the normal range. Worth discussing with a doctor.`;
        lastEvaluatedPose = "pointing";
        lastEvaluatedLine = line;
        this.say(line, "pointing");
        return;
      }

      // 4. All trends normal
      const line = "All results are within the normal range.";
      lastEvaluatedPose = "smile";
      lastEvaluatedLine = line;
      this.say(line, "smile");
    },

    /**
     * Restore the evaluated pose/line after a temporary message (e.g. card tap or chat)
     */
    restoreDefault() {
      if (lastEvaluatedLine) {
        this.say(lastEvaluatedLine, lastEvaluatedPose);
      }
    },

    /**
     * Set loading pose during upload / read
     */
    setLoading(message = "Reading the report...") {
      this.say(message, "reading");
    },

    /**
     * Set chat waiting pose
     */
    setChatWaiting() {
      this.say("Let me look at the reports...", "reading");
    },

    /**
     * Set error pose with exact API error sentence
     */
    setError(errorMessage) {
      this.say(errorMessage || "Something went wrong. Try again.", "shrug");
    },

    show() {
      if (mascotContainer) mascotContainer.style.display = "flex";
    },

    hide() {
      if (mascotContainer) mascotContainer.style.display = "none";
    }
  };
})();

if (typeof window !== "undefined") {
  window.Mascot = Mascot;
} else if (typeof globalThis !== "undefined") {
  globalThis.Mascot = Mascot;
}
