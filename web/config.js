/**
 * Baseline Configuration
 * The single source of truth for application settings.
 */
const CONFIG = {
  // Base URL for the backend API (no trailing slash).
  // Locally: the backend on port 8000 of whatever machine served this page, so the same file works
  // on the laptop (localhost) and on a phone on the same Wi-Fi (the laptop's IP).
  // For the live deploy, replace with the Lambda Function URL, e.g. "https://abc123.lambda-url.us-east-1.on.aws".
  apiUrl: `${location.protocol}//${location.hostname}:8000`,

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

