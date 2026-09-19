/**
 * Baseline Configuration
 * The single source of truth for application settings.
 */
const CONFIG = {
  // Base URL for the backend API (no trailing slash).
  // Leave empty or set to your backend server URL e.g. "http://localhost:8000"
  apiUrl: "http://localhost:8000",

  // When true, all API calls use mock.js with realistic delays and no backend needed.
  useMock: false,

  // Name of the doctor mascot.
  mascotName: "Dr. Bindu"
};

// Freeze configuration to prevent accidental runtime mutations
Object.freeze(CONFIG);

if (typeof window !== "undefined") {
  window.CONFIG = CONFIG;
} else if (typeof globalThis !== "undefined") {
  globalThis.CONFIG = CONFIG;
}

