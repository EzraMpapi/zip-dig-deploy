// src/smart/lib/startup.jsx
import { configureSupabase } from "./supabase.jsx";

let _clientInitialized = false;

export function initClientRuntime() {
  if (_clientInitialized) return;
  _clientInitialized = true;

  // Configure Supabase from Vite-injected env (VITE_ vars).
  // No secrets are committed — these env vars come from your local .env or CI/CD.
  configureSupabase({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
}

// Run at module load so apps that import this file get the effect.
// It is idempotent (safe to import multiple times).
initClientRuntime();
