/**
 * Baseline Mock Data Store & Simulator
 * Provides full in-memory API emulation with realistic async delays.
 */
const MockAPI = (() => {
  // In-memory people store initialized per Part 8
  let people = [
    {
      person_id: "arjun-rao-1a2b",
      title: "Mr",
      name: "Arjun Rao",
      is_self: false,
      display_name: "Mr Arjun Rao"
    },
    {
      person_id: "ramesh-rao-9c3d",
      title: "Mr",
      name: "Ramesh Rao",
      is_self: false,
      display_name: "Mr Ramesh Rao"
    },
    {
      person_id: "lakshmamma-7b1c",
      title: "Ms",
      name: "Lakshmamma",
      is_self: true,
      display_name: "Ms Lakshmamma"
    }
  ];

  // Tracks whether a report has been added for Ms Lakshmamma
  let sunitaState = "before"; // "before" or "after"
  // The last photo uploaded in this browser session; the demo has no storage behind it.
  let uploadedPhotoUrl = null;
  let justUploaded = false;

  // Error simulation for Task 12 unhappy path testing
  const simulatedErrors = {
    people: null,     // e.g. "Simulated 500 error loading people"
    addPerson: null,  // e.g. "Simulated error adding person"
    trends: null,     // e.g. "Simulated network failure on trends"
    upload: null,     // e.g. "Simulated 503 AWS model unreachable"
    doctor: null,     // e.g. "Simulated doctor view failure"
    chat: null        // e.g. "AWS or the model is unreachable."
  };


  // Translations for trends summaries to support the demo video (Part 10, step 4)
  const translations = {
    fastingbloodglucose: {
      before: {
        en: "Gone up since the last report (98 → 109 mg/dL). Above the normal range (70–100 mg/dL).",
        kn: "ಕಳೆದ ವರದಿಯಿಂದ ಹೆಚ್ಚಾಗಿದೆ (98 → 109 mg/dL). ಸಾಮಾನ್ಯ ಮಿತಿಗಿಂತ ಹೆಚ್ಚಾಗಿದೆ (70–100 mg/dL).",
        hi: "पिछली रिपोर्ट से बढ़ गया है (98 → 109 mg/dL)। सामान्य सीमा (70–100 mg/dL) से अधिक है।"
      },
      after: {
        en: "Gone up 2 times in a row (98 → 109 → 118 mg/dL). Above the normal range (70–100 mg/dL).",
        kn: "ಸತತ 2 ಬಾರಿ ಹೆಚ್ಚಾಗಿದೆ (98 → 109 → 118 mg/dL). ಸಾಮಾನ್ಯ ಮಿತಿಗಿಂತ ಹೆಚ್ಚಾಗಿದೆ (70–100 mg/dL).",
        hi: "लगातार 2 बार बढ़ा है (98 → 109 → 118 mg/dL)। सामान्य सीमा (70–100 mg/dL) से अधिक है।"
      }
    },
    hba1c: {
      before: {
        en: "Gone up since the last report (5.6 → 6.1 %). Above the normal range (4–5.6 %).",
        kn: "ಕಳೆದ ವರದಿಯಿಂದ ಹೆಚ್ಚಾಗಿದೆ (5.6 → 6.1 %). ಸಾಮಾನ್ಯ ಮಿತಿಗಿಂತ ಹೆಚ್ಚಾಗಿದೆ (4–5.6 %).",
        hi: "पिछली रिपोर्ट से बढ़ गया है (5.6 → 6.1 %)। सामान्य सीमा (4–5.6 %) से अधिक है।"
      },
      after: {
        en: "Gone up 2 times in a row (5.6 → 6.1 → 6.4 %). Above the normal range (4–5.6 %).",
        kn: "ಸತತ 2 ಬಾರಿ ಹೆಚ್ಚಾಗಿದೆ (5.6 → 6.1 → 6.4 %). ಸಾಮಾನ್ಯ ಮಿತಿಗಿಂತ ಹೆಚ್ಚಾಗಿದೆ (4–5.6 %).",
        hi: "लगातार 2 बार बढ़ा है (5.6 → 6.1 → 6.4 %)। सामान्य सीमा (4–5.6 %) से अधिक है।"
      }
    },
    haemoglobin: {
      before: {
        en: "Gone down since the last report (13.9 → 13.6 g/dL). Within the normal range.",
        kn: "ಕಳೆದ ವರದಿಯಿಂದ ಕಡಿಮೆಯಾಗಿದೆ (13.9 → 13.6 g/dL). ಸಾಮಾನ್ಯ ಮಿತಿಯಲ್ಲಿದೆ.",
        hi: "पिछली रिपोर्ट से कम हुआ है (13.9 → 13.6 g/dL)। सामान्य सीमा के भीतर है।"
      },
      after: {
        en: "Gone up since the last report (13.6 → 13.8 g/dL). Within the normal range.",
        kn: "ಕಳೆದ ವರದಿಯಿಂದ ಹೆಚ್ಚಾಗಿದೆ (13.6 → 13.8 g/dL). ಸಾಮಾನ್ಯ ಮಿತಿಯಲ್ಲಿದೆ.",
        hi: "पिछली रिपोर्ट से बढ़ गया है (13.6 → 13.8 g/dL)। सामान्य सीमा के भीतर है।"
      }
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Contract shape: history is [{date, value}], oldest first.
  const REPORT_DATES = ["2026-03-04", "2026-08-08", "2026-09-12"];
  const history = (values) => values.map((value, i) => ({ date: REPORT_DATES[i], value }));

  return {
    // Reset mock state (useful for tests and demos)
    reset() {
      sunitaState = "before";
      justUploaded = false;
      Object.keys(simulatedErrors).forEach((k) => (simulatedErrors[k] = null));
    },

    /**
     * Force an error on any API endpoint (Task 12 testing)
     * @param {'people'|'addPerson'|'trends'|'upload'|'doctor'|'chat'} endpoint
     * @param {string|null} errorMessage - Error sentence to return, or null to clear
     */
    setSimulatedError(endpoint, errorMessage) {
      if (simulatedErrors.hasOwnProperty(endpoint)) {
        simulatedErrors[endpoint] = errorMessage;
      }
    },

    // POST /api/auth/register and /api/auth/login: any valid-looking email and 8+ character password
    async register(email, password, username = "") {
      const cleanName = username.trim().replace(/\s+/g, " ");
      if (cleanName.length < 2 || cleanName.length > 30) {
        throw new Error("Choose a username of 2 to 30 letters or digits.");
      }
      const { email: cleanEmail } = await this.login(email, password);
      return { email: cleanEmail, username: cleanName };
    },

    async login(email = "", password = "") {
      await sleep(300);
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
        throw new Error("Enter a valid email address.");
      }
      if (password.length < 8 || password.length > 128) {
        throw new Error("Use a password of 8 to 128 characters.");
      }
      return { token: "mock-token", email: cleanEmail, username: cleanEmail.split("@")[0] };
    },

    // GET /api/people
    async getPeople() {
      await sleep(150);
      if (simulatedErrors.people) {
        throw new Error(simulatedErrors.people);
      }
      // Ensure "is_self" profile comes first, then alphabetical

      const sorted = [...people].sort((a, b) => {
        if (a.is_self && !b.is_self) return -1;
        if (!a.is_self && b.is_self) return 1;
        return a.display_name.localeCompare(b.display_name);
      });
      return { people: sorted };
    },

    // POST /api/people
    async addPerson({ title = "", name = "", is_self = false }) {
      await sleep(250);
      if (simulatedErrors.addPerson) {
        throw new Error(simulatedErrors.addPerson);
      }
      const allowedTitles = ["", "Mr", "Ms", "Mrs", "Miss", "Dr", "Mx"];
      if (!allowedTitles.includes(title)) {
        throw new Error("Invalid title. Allowed: Mr, Ms, Mrs, Miss, Dr, Mx or none.");
      }

      const trimmedName = (name || "").trim();
      if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 40) {
        throw new Error("Name must be between 1 and 40 characters.");
      }

      // Check for valid characters: letters in any script, spaces, ., ', -
      const nameRegex = /^[\p{L}\s.'-]+$/u;
      if (!nameRegex.test(trimmedName)) {
        throw new Error("Name contains invalid characters.");
      }

      if (is_self && people.some((p) => p.is_self)) {
        const err = new Error("A profile for yourself already exists.");
        err.status = 409;
        throw err;
      }

      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 16) || "person";
      const randomHex = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
      const person_id = `${slug}-${randomHex}`;
      const display_name = title ? `${title} ${trimmedName}` : trimmedName;

      const newPerson = {
        person_id,
        title,
        name: trimmedName,
        is_self: Boolean(is_self),
        display_name
      };

      people.push(newPerson);
      return newPerson;
    },

    // GET /api/trends?person_id=...&lang=en|kn|hi
    async getTrends(personId, lang = "en") {
      await sleep(300);
      if (simulatedErrors.trends) {
        throw new Error(simulatedErrors.trends);
      }
      const person = people.find((p) => p.person_id === personId);

      if (!person) {
        const err = new Error("Person not found.");
        err.status = 404;
        throw err;
      }

      // Only Ms Lakshmamma has reports in mock mode
      if (personId !== "lakshmamma-7b1c") {
        return {
          person_id: personId,
          report: null,
          trends: [],
          reminder: null
        };
      }

      const isAfter = sunitaState === "after";
      const isUpdated = justUploaded;
      // Subsequent GETs return updated: false
      justUploaded = false;

      const fbgSummary =
        translations.fastingbloodglucose[isAfter ? "after" : "before"][lang] ||
        translations.fastingbloodglucose[isAfter ? "after" : "before"].en;

      const hba1cSummary =
        translations.hba1c[isAfter ? "after" : "before"][lang] ||
        translations.hba1c[isAfter ? "after" : "before"].en;

      const hbSummary =
        translations.haemoglobin[isAfter ? "after" : "before"][lang] ||
        translations.haemoglobin[isAfter ? "after" : "before"].en;

      const trends = [
        {
          test_name: "Fasting Blood Glucose",
          test_key: "fastingbloodglucose",
          unit: "mg/dL",
          ref_low: 70,
          ref_high: 100,
          current: isAfter ? 118 : 109,
          previous: isAfter ? 109 : 98,
          direction: "rising",
          streak: isAfter ? 2 : 1,
          status: "high",
          history: history(isAfter ? [98, 109, 118] : [98, 109]),
          summary: fbgSummary,
          updated: isUpdated
        },
        {
          test_name: "HbA1c",
          test_key: "hba1c",
          unit: "%",
          ref_low: 4.0,
          ref_high: 5.6,
          current: isAfter ? 6.4 : 6.1,
          previous: isAfter ? 6.1 : 5.6,
          direction: "rising",
          streak: isAfter ? 2 : 1,
          status: "high",
          history: history(isAfter ? [5.6, 6.1, 6.4] : [5.6, 6.1]),
          summary: hba1cSummary,
          updated: isUpdated
        },
        {
          test_name: "Haemoglobin",
          test_key: "haemoglobin",
          unit: "g/dL",
          ref_low: 13.0,
          ref_high: 17.0,
          current: isAfter ? 13.8 : 13.6,
          previous: isAfter ? 13.6 : 13.9,
          direction: isAfter ? "rising" : "falling",
          streak: 1,
          status: "normal",
          history: history(isAfter ? [13.9, 13.6, 13.8] : [13.9, 13.6]),
          summary: hbSummary,
          updated: isUpdated
        }
      ];

      const reminder = isAfter
        ? { last_report: "2026-09-12", next_due: "2026-12-11", overdue: false }
        : { last_report: "2026-08-08", next_due: "2026-11-06", overdue: false };

      const report = isAfter
        ? {
            report_id: "mock-report-0912",
            report_date: "2026-09-12",
            lab_name: "Sri Sai Diagnostics"
          }
        : null;

      return {
        person_id: personId,
        report,
        trends,
        reminder
      };
    },

    // POST /api/reports multipart
    async uploadReport(formData) {
      // Simulate ~4s processing delay per Part 8
      await sleep(4000);
      if (simulatedErrors.upload) {
        throw new Error(simulatedErrors.upload);
      }
      const personId = formData.get("person_id");
      const person = people.find((p) => p.person_id === personId);
      if (!person) {
        const err = new Error("Person not found.");
        err.status = 404;
        throw err;
      }

      // Transition Lakshmamma to "after" state
      if (personId === "lakshmamma-7b1c") {
        sunitaState = "after";
        justUploaded = true;
      }

      const lang = formData.get("lang") || "en";
      const trendsResult = await this.getTrends(personId, lang);
      // Ensure updated is true on upload response
      trendsResult.trends.forEach((t) => (t.updated = true));
      return trendsResult;
    },

    // GET /api/doctor?person_id=...
    async getDoctorView(personId) {
      await sleep(350);
      if (simulatedErrors.doctor) {
        throw new Error(simulatedErrors.doctor);
      }
      const person = people.find((p) => p.person_id === personId);
      if (!person) {
        const err = new Error("Person not found.");
        err.status = 404;
        throw err;
      }

      if (personId !== "lakshmamma-7b1c") {
        return {
          person_id: personId,
          report_dates: [],
          tests: []
        };
      }

      const isAfter = sunitaState === "after";
      const reportDates = isAfter
        ? ["2026-03-04", "2026-08-08", "2026-09-12"]
        : ["2026-03-04", "2026-08-08"];

      // Tests in alphabetical order as required by Part 8
      const tests = [
        {
          test_name: "Fasting Blood Glucose",
          test_key: "fastingbloodglucose",
          results: [
            { date: "2026-03-04", value: 98, unit: "mg/dL", ref_low: 70, ref_high: 100, flag: "" },
            { date: "2026-08-08", value: 109, unit: "mg/dL", ref_low: 70, ref_high: 100, flag: "H" },
            ...(isAfter
              ? [{ date: "2026-09-12", value: 118, unit: "mg/dL", ref_low: 70, ref_high: 100, flag: "H" }]
              : [])
          ]
        },
        {
          test_name: "Haemoglobin",
          test_key: "haemoglobin",
          results: [
            { date: "2026-03-04", value: 13.9, unit: "g/dL", ref_low: 13.0, ref_high: 17.0, flag: "" },
            { date: "2026-08-08", value: 13.6, unit: "g/dL", ref_low: 13.0, ref_high: 17.0, flag: "" },
            ...(isAfter
              ? [{ date: "2026-09-12", value: 13.8, unit: "g/dL", ref_low: 13.0, ref_high: 17.0, flag: "" }]
              : [])
          ]
        },
        {
          test_name: "HbA1c",
          test_key: "hba1c",
          results: [
            { date: "2026-03-04", value: 5.6, unit: "%", ref_low: 4.0, ref_high: 5.6, flag: "" },
            { date: "2026-08-08", value: 6.1, unit: "%", ref_low: 4.0, ref_high: 5.6, flag: "H" },
            ...(isAfter
              ? [{ date: "2026-09-12", value: 6.4, unit: "%", ref_low: 4.0, ref_high: 5.6, flag: "H" }]
              : [])
          ]
        }
      ];

      return {
        person_id: personId,
        report_dates: reportDates,
        tests
      };
    },

    // POST /api/chat
    async askChat(personId, question, lang = "en") {
      // Simulate ~2s delay per Part 8
      await sleep(2000);
      if (simulatedErrors.chat) {
        throw new Error(simulatedErrors.chat);
      }
      const person = people.find((p) => p.person_id === personId);

      if (!person) {
        const err = new Error("Person not found.");
        err.status = 404;
        throw err;
      }

      if (personId !== "lakshmamma-7b1c") {
        return {
          person_id: personId,
          reply: "There are no reports for this person yet. Add a lab report first, then ask again."
        };
      }

      return {
        person_id: personId,
        reply: "HbA1c has gone up 2 times in a row, to 6.4 %. It's worth discussing with your doctor."
      };
    },

    // POST /api/analyze: instant report reading for visitor with no account
    async analyseWithoutAccount(formData) {
      await sleep(1500);
      if (simulatedErrors.upload) {
        throw new Error(simulatedErrors.upload);
      }
      const file = formData.get("file");
      // No guessing from pixel colours here: it turned away genuine reports (a real one was
      // refused on the deployed demo). Judging whether a photo is a lab report is the model's
      // job on the real backend, which actually reads the image.
      const filename = (file && file.name ? file.name.toLowerCase() : "");
      if (filename && (filename.includes("dog") || filename.includes("cat") || filename.includes("selfie") || filename.includes("food") || filename.includes("receipt") || filename.includes("random") || filename.includes("invalid"))) {
        throw new Error(t("error.notMedical"));
      }
      return {
        report_date: "2026-09-12",
        lab_name: "Sri Sai Diagnostics",
        readings: [
          { test_key: "fastingbloodglucose", test_name: "Fasting Blood Glucose", value: 118, unit: "mg/dL", ref_low: 70, ref_high: 100, status: "high" },
          { test_key: "hba1c", test_name: "HbA1c", value: 6.4, unit: "%", ref_low: 4.0, ref_high: 5.6, status: "high" },
          { test_key: "haemoglobin", test_name: "Haemoglobin", value: 13.8, unit: "g/dL", ref_low: 13.0, ref_high: 17.0, status: "normal" }
        ],
        trends: [
          { test_key: "fastingbloodglucose", test_name: "Fasting Blood Glucose", unit: "mg/dL", ref_low: 70, ref_high: 100, current: 118, previous: null, direction: "first", streak: 0, status: "high", history: [{ date: "2026-09-12", value: 118 }], summary: "Above the normal range (70–100 mg/dL).", updated: false },
          { test_key: "hba1c", test_name: "HbA1c", unit: "%", ref_low: 4.0, ref_high: 5.6, current: 6.4, previous: null, direction: "first", streak: 0, status: "high", history: [{ date: "2026-09-12", value: 6.4 }], summary: "Above the normal range (4–5.6 %).", updated: false },
          { test_key: "haemoglobin", test_name: "Haemoglobin", unit: "g/dL", ref_low: 13.0, ref_high: 17.0, current: 13.8, previous: null, direction: "first", streak: 0, status: "normal", history: [{ date: "2026-09-12", value: 13.8 }], summary: "Within the normal range.", updated: false }
        ],
        summary: "Fasting Blood Glucose (118 mg/dL) and HbA1c (6.4%) are above normal ranges. Haemoglobin is healthy at 13.8 g/dL.",
        saved: false
      };
    },

    // POST /api/reports/preview: preview photo readings
    async previewReport(formData) {
      await sleep(1500);
      if (simulatedErrors.upload) {
        throw new Error(simulatedErrors.upload);
      }
      const file = formData.get("file");
      // No guessing from pixel colours here: it turned away genuine reports (a real one was
      // refused on the deployed demo). Judging whether a photo is a lab report is the model's
      // job on the real backend, which actually reads the image.
      const filename = (file && file.name ? file.name.toLowerCase() : "");
      if (filename && (filename.includes("dog") || filename.includes("cat") || filename.includes("selfie") || filename.includes("food") || filename.includes("receipt") || filename.includes("random") || filename.includes("invalid"))) {
        throw new Error(t("error.notMedical"));
      }
      const personId = formData.get("person_id");
      const person = people.find((p) => p.person_id === personId) || people[0];
      return {
        person_id: person.person_id,
        name_check: { status: "same", detected_name: person.display_name },
        report_date: formData.get("report_date") || "2026-09-12",
        lab_name: "Sri Sai Diagnostics",
        patient_name: person.display_name,
        readings: [
          { test_key: "fastingbloodglucose", test_name: "Fasting Blood Glucose", value: 118, unit: "mg/dL", ref_low: 70, ref_high: 100, status: "high" },
          { test_key: "hba1c", test_name: "HbA1c", value: 6.4, unit: "%", ref_low: 4.0, ref_high: 5.6, status: "high" },
          { test_key: "haemoglobin", test_name: "Haemoglobin", value: 13.8, unit: "g/dL", ref_low: 13.0, ref_high: 17.0, status: "normal" }
        ],
        saved: false
      };
    },

    // POST /api/reports/confirm: save reviewed report
    async confirmReport(formData) {
      await sleep(1200);
      const personId = formData.get("person_id");
      let payload = {};
      try { payload = JSON.parse(formData.get("payload") || "{}"); } catch (e) {}
      // The demo has no S3 behind it, so the photo is kept in this browser for this visit only.
      const photo = formData.get("file");
      if (photo) {
        try { uploadedPhotoUrl = URL.createObjectURL(photo); } catch (e) {}
      }
      if (personId === "lakshmamma-7b1c") {
        sunitaState = "after";
      }
      justUploaded = true;
      const lang = payload.lang || "en";
      const trendsResult = await this.getTrends(personId, lang);
      trendsResult.trends.forEach((t) => (t.updated = true));
      return {
        ...trendsResult,
        report: {
          report_id: "mock-report-0912",
          report_date: payload.report_date || "2026-09-12",
          lab_name: payload.lab_name || "Sri Sai Diagnostics",
          patient_name: payload.patient_name || "Ms Lakshmamma",
          summary: "Fasting Blood Glucose and HbA1c have risen above the normal range. Haemoglobin remains normal."
        }
      };
    },

    // GET /api/reports: list reports
    async listReports(personId) {
      await sleep(200);
      if (personId === "lakshmamma-7b1c") {
        const isAfter = sunitaState === "after";
        const reports = [
          ...(isAfter ? [{
            report_id: "mock-report-0912",
            report_date: "2026-09-12",
            lab_name: "Sri Sai Diagnostics",
            patient_name: "Ms Lakshmamma",
            uploaded_at: "2026-09-12T08:30:00Z",
            height_cm: 158,
            weight_kg: 62,
            result_count: 3
          }] : []),
          {
            report_id: "mock-report-0808",
            report_date: "2026-08-08",
            lab_name: "Sri Sai Diagnostics",
            patient_name: "Ms Lakshmamma",
            uploaded_at: "2026-08-08T09:00:00Z",
            height_cm: 158,
            weight_kg: 62,
            result_count: 3
          },
          {
            report_id: "mock-report-0304",
            report_date: "2026-03-04",
            lab_name: "Apollo Clinic",
            patient_name: "Ms Lakshmamma",
            uploaded_at: "2026-03-04T10:15:00Z",
            height_cm: 158,
            weight_kg: 63,
            result_count: 3
          }
        ];
        return { person_id: personId, reports };
      }
      return { person_id: personId, reports: [] };
    },

    // GET /api/reports/{id}: report detail
    async getReport(personId, reportId, lang = "en") {
      await sleep(250);
      return {
        report_id: reportId,
        report_date: reportId.includes("0912") ? "2026-09-12" : reportId.includes("0808") ? "2026-08-08" : "2026-03-04",
        lab_name: reportId.includes("0304") ? "Apollo Clinic" : "Sri Sai Diagnostics",
        patient_name: "Ms Lakshmamma",
        image_url: uploadedPhotoUrl,
        height_cm: 158,
        weight_kg: 62,
        readings: [
          { test_key: "fastingbloodglucose", test_name: "Fasting Blood Glucose", value: reportId.includes("0912") ? 118 : reportId.includes("0808") ? 109 : 98, unit: "mg/dL", ref_low: 70, ref_high: 100, status: reportId.includes("0304") ? "normal" : "high" },
          { test_key: "hba1c", test_name: "HbA1c", value: reportId.includes("0912") ? 6.4 : reportId.includes("0808") ? 6.1 : 5.6, unit: "%", ref_low: 4.0, ref_high: 5.6, status: reportId.includes("0304") ? "normal" : "high" },
          { test_key: "haemoglobin", test_name: "Haemoglobin", value: reportId.includes("0912") ? 13.8 : reportId.includes("0808") ? 13.6 : 13.9, unit: "g/dL", ref_low: 13.0, ref_high: 17.0, status: "normal" }
        ],
        summary: "Fasting Blood Glucose and HbA1c have tracked higher over recent months while Haemoglobin is steady."
      };
    },

    // PATCH /api/people/{id}: update person
    async updatePerson(personId, changes = {}) {
      await sleep(200);
      const person = people.find((p) => p.person_id === personId);
      if (!person) throw new Error("Person not found.");
      Object.assign(person, changes);
      if (changes.name || changes.title) {
        person.display_name = changes.title ? `${changes.title} ${changes.name || person.name}` : (changes.name || person.name);
      }
      return person;
    },

    // PUT /api/reports/{id}: edit report
    async editReport(reportId, body) {
      await sleep(300);
      const personId = body.person_id || "lakshmamma-7b1c";
      const trendsResult = await this.getTrends(personId, body.lang || "en");
      return {
        ...trendsResult,
        report: {
          report_id: reportId,
          report_date: body.report_date || "2026-09-12",
          summary: "Report values updated successfully."
        }
      };
    },

    // DELETE /api/reports/{id}: delete report
    async deleteReport(personId, reportId) {
      await sleep(200);
      return { ok: true };
    }
  };
})();

if (typeof window !== "undefined") {
  window.MockAPI = MockAPI;
} else if (typeof globalThis !== "undefined") {
  globalThis.MockAPI = MockAPI;
}

