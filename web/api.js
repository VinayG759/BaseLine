/**
 * Baseline API Module
 * Switches seamlessly between live HTTP endpoints and MockAPI based on CONFIG.useMock.
 * Enforces standardized error extraction and provides text sanitization via escapeHtml().
 */

/**
 * Escapes unsafe HTML characters to prevent XSS.
 * Every piece of text received from the API must pass through this before entering the DOM.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * The logged-in session, kept in this browser.
 * Technical Concept: Bearer token
 * After login the backend hands out a random token; sending it as "Authorization: Bearer <token>"
 * on every request proves who you are, without sending the password again.
 */
const Auth = {
  token() {
    try { return localStorage.getItem("baseline_token"); } catch { return null; }
  },
  email() {
    try { return localStorage.getItem("baseline_email"); } catch { return null; }
  },
  username() {
    try { return localStorage.getItem("baseline_username"); } catch { return null; }
  },
  save(token, email, username) {
    try {
      localStorage.setItem("baseline_token", token);
      localStorage.setItem("baseline_email", email);
      localStorage.setItem("baseline_username", username || "");
    } catch (e) {
      console.warn("localStorage write failed:", e);
    }
  },
  clear() {
    try {
      localStorage.removeItem("baseline_token");
      localStorage.removeItem("baseline_email");
      localStorage.removeItem("baseline_username");
    } catch {}
  },
  goToLogin() {
    window.location.href = "login.html";
  }
};

const API = (() => {
  const DEFAULT_ERROR_MESSAGE = () => t("error.generic");

  /**
   * fetch() for logged-in calls: adds the session token, and on 401 (not logged in or session
   * expired) forgets the token and goes to the login page.
   */
  async function send(url, options = {}) {
    const token = Auth.token();
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      Auth.clear();
      Auth.goToLogin();
    }
    return res;
  }

  /** POST credentials to an auth endpoint; returns the JSON reply. */
  async function postCredentials(path, body) {
    try {
      const res = await fetch(`${CONFIG.apiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw await handleErrorResponse(res);
      return await res.json();
    } catch (err) {
      if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
      throw err;
    }
  }

  /**
   * Helper to parse error responses according to Rule 5:
   * "Every error shows the API's 'error' sentence exactly as sent.
   * If there is none, show 'Something went wrong. Try again.'"
   */
  async function handleErrorResponse(response) {
    let errorMessage = DEFAULT_ERROR_MESSAGE();
    try {
      const data = await response.json();
      if (data && typeof data.error === "string" && data.error.trim()) {
        errorMessage = I18n.server(data.error.trim());
      }
    } catch {
      // Failed to parse JSON error; preserve DEFAULT_ERROR_MESSAGE
    }
    const err = new Error(errorMessage);
    err.status = response.status;
    return err;
  }

  /** JSON or form requests to the API with the session token; errors carry the API's sentence. */
  async function call(method, path, body) {
    if (CONFIG.useMock) {
      throw new Error(t("error.generic"));   // the review, history and profile flows need the real backend
    }
    try {
      const options = { method, headers: {} };
      if (body instanceof FormData) {
        options.body = body;
      } else if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }
      const res = await send(`${CONFIG.apiUrl}${path}`, options);
      if (!res.ok) throw await handleErrorResponse(res);
      return await res.json();
    } catch (err) {
      if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
      throw err;
    }
  }

  const q = (params) => new URLSearchParams(params).toString();

  /**
   * POST /api/analyze: read one report for a visitor with no account.
   *
   * Deliberately not `send()`: no token goes out, and a refusal must never bounce
   * the visitor to the login page. Nothing is stored on the server either.
   */
  async function analyseWithoutAccount(formData) {
    try {
      const res = await fetch(`${CONFIG.apiUrl}/api/analyze`, { method: "POST", body: formData });
      if (!res.ok) throw await handleErrorResponse(res);
      return await res.json();
    } catch (err) {
      if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
      throw err;
    }
  }

  return {
    analyseWithoutAccount,

    /** PATCH /api/people/{id}: only the fields sent change. */
    updatePerson: (personId, changes) => call("PATCH", `/api/people/${encodeURIComponent(personId)}`, changes),

    /** POST /api/reports/preview: read the photo and check the name. Saves nothing. */
    previewReport: (formData) => call("POST", "/api/reports/preview", formData),

    /** POST /api/reports/confirm: save the reviewed values with the photo. */
    confirmReport: (formData) => call("POST", "/api/reports/confirm", formData),

    listReports: (personId) => call("GET", `/api/reports?${q({ person_id: personId })}`),

    getReport: (personId, reportId, lang) =>
      call("GET", `/api/reports/${encodeURIComponent(reportId)}?${q({ person_id: personId, lang })}`),

    editReport: (reportId, body) => call("PUT", `/api/reports/${encodeURIComponent(reportId)}`, body),

    deleteReport: (personId, reportId) =>
      call("DELETE", `/api/reports/${encodeURIComponent(reportId)}?${q({ person_id: personId })}`),

    /** Creates the account only; the person then logs in. Returns {email, username}. */
    async register(email, password, username) {
      if (CONFIG.useMock) return MockAPI.register(email, password, username);
      return postCredentials("/api/auth/register", { email, password, username });
    },

    /** Logs in and remembers the session in this browser. Returns {token, email, username}. */
    async login(email, password) {
      const data = CONFIG.useMock
        ? await MockAPI.login(email, password)
        : await postCredentials("/api/auth/login", { email, password });
      Auth.save(data.token, data.email, data.username);
      return data;
    },

    /** Ends the session on the server (best effort) and forgets it here. */
    async logout() {
      if (!CONFIG.useMock) {
        try {
          await fetch(`${CONFIG.apiUrl}/api/auth/logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${Auth.token()}` }
          });
        } catch {}
      }
      Auth.clear();
    },

    /**
     * GET /api/people
     * Returns: { people: [ { person_id, title, name, is_self, display_name }, ... ] }
     */
    async getPeople() {
      if (CONFIG.useMock) {
        return MockAPI.getPeople();
      }
      try {
        const res = await send(`${CONFIG.apiUrl}/api/people`);
        if (!res.ok) throw await handleErrorResponse(res);
        return await res.json();
      } catch (err) {
        if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
        throw err;
      }
    },

    /**
     * POST /api/people
     * Body: { title, name, is_self }
     * Returns 201 with created person object.
     */
    async addPerson(personData) {
      if (CONFIG.useMock) {
        return MockAPI.addPerson(personData);
      }
      try {
        const res = await send(`${CONFIG.apiUrl}/api/people`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(personData)
        });
        if (!res.ok) throw await handleErrorResponse(res);
        return await res.json();
      } catch (err) {
        if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
        throw err;
      }
    },

    /**
     * GET /api/trends?person_id=...&lang=en|kn|hi
     * Returns: { person_id, report, trends[], reminder }
     */
    async getTrends(personId, lang = "en") {
      if (CONFIG.useMock) {
        return MockAPI.getTrends(personId, lang);
      }
      try {
        const url = `${CONFIG.apiUrl}/api/trends?person_id=${encodeURIComponent(personId)}&lang=${encodeURIComponent(lang)}`;
        const res = await send(url);
        if (!res.ok) throw await handleErrorResponse(res);
        return await res.json();
      } catch (err) {
        if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
        throw err;
      }
    },

    /**
     * POST /api/reports multipart: person_id, file, report_date (optional), lang (optional)
     * Returns: { person_id, report, trends[], reminder }
     */
    async uploadReport(formData) {
      if (CONFIG.useMock) {
        return MockAPI.uploadReport(formData);
      }
      try {
        const res = await send(`${CONFIG.apiUrl}/api/reports`, {
          method: "POST",
          body: formData
        });
        if (!res.ok) throw await handleErrorResponse(res);
        return await res.json();
      } catch (err) {
        if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
        throw err;
      }
    },

    /**
     * GET /api/doctor?person_id=...
     * Returns clinical table data: { person_id, report_dates[], tests[] }
     */
    async getDoctorView(personId) {
      if (CONFIG.useMock) {
        return MockAPI.getDoctorView(personId);
      }
      try {
        const url = `${CONFIG.apiUrl}/api/doctor?person_id=${encodeURIComponent(personId)}`;
        const res = await send(url);
        if (!res.ok) throw await handleErrorResponse(res);
        return await res.json();
      } catch (err) {
        if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
        throw err;
      }
    },

    /**
     * POST /api/chat JSON { person_id, question, lang }
     * Returns: { person_id, reply }
     */
    async askChat(personId, question, lang = "en") {
      if (CONFIG.useMock) {
        return MockAPI.askChat(personId, question, lang);
      }
      try {
        const res = await send(`${CONFIG.apiUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ person_id: personId, question, lang })
        });
        if (!res.ok) throw await handleErrorResponse(res);
        return await res.json();
      } catch (err) {
        if (!err.status) err.message = DEFAULT_ERROR_MESSAGE();
        throw err;
      }
    }
  };
})();

if (typeof window !== "undefined") {
  window.API = API;
  window.Auth = Auth;
  window.escapeHtml = escapeHtml;
} else if (typeof globalThis !== "undefined") {
  globalThis.API = API;
  globalThis.escapeHtml = escapeHtml;
}

