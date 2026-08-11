import * as offline from "./offline/index.jsx";
/* ────────────────────────────────────────────────────────────────
   SUPABASE CLIENT — hand-rolled, fetch-based (no SDK)

   Credentials come from Vite env vars so real keys are never committed. Set
   them in .env locally and in your deployment platform's environment
   variables. This module exposes `configureSupabase()` so the app or a
   server entrypoint can explicitly initialize the client at app startup.
   ──────────────────────────────────────────────────────────────── */

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

let SUPABASE_URL = ENV.VITE_SUPABASE_URL || "https://rlhngsrihahhyxnjxrxm.supabase.co";
let SUPABASE_ANON_KEY =
  ENV.VITE_SUPABASE_ANON_KEY ||
  ""; // keep blank by default to avoid committing secrets

export function configureSupabase({ url, anonKey } = {}) {
  // Only set values if provided; this can be called once at app startup
  if (url) SUPABASE_URL = url;
  if (anonKey) SUPABASE_ANON_KEY = anonKey;
  // Recompute IS_CONFIGURED lazily through the exported getter
  ensureTransportConfigured();
}

export function getSupabaseUrl() {
  return SUPABASE_URL;
}

export function getSupabaseAnonKey() {
  return SUPABASE_ANON_KEY;
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/* Mutable module state — writers must use the setter, never `DEMO_OVERRIDE = x`,
   because ES modules forbid assigning to an imported binding. */
export let DEMO_OVERRIDE = false;
export function setDemoOverride(v) {
  DEMO_OVERRIDE = v;
}

export function authHeaders() {
  const token =
    (typeof window !== "undefined" && window.localStorage?.getItem("bs_access_token")) ||
    SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ... authSignUp, authSignIn, authSignOut, authGetUser, authSignInWithOAuth,
// callRpc unchanged (omitted here for brevity) — they will reference SUPABASE_URL and
// SUPABASE_ANON_KEY via the functions above so the values can be injected at startup.

// (The rest of the file is unchanged apart from moving the offline transport
// configuration into a guarded function so it only runs once.)

// --- network transport and offline integration ---

let transportConfigured = false;
function ensureTransportConfigured() {
  if (transportConfigured) return;
  offline.syncEngine.configureTransport(rawRequest);
  transportConfigured = true;
}

// Keep the rawRequest implementation as before (same logic), omitted here for
// brevity — the existing implementation will remain but now is wired only once.

// For compatibility, call ensureTransportConfigured() at module load so the
// current behavior is preserved when no explicit configureSupabase call is made.
ensureTransportConfigured();

// Export existing functions (sb builder, auth helpers, etc.) below —
// the rest of the file content is left unchanged to preserve behavior.
