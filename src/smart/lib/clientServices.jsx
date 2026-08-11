// src/smart/lib/clientServices.jsx
import { configureSupabase } from "./supabase.jsx";
import * as offline from "./offline/index.jsx";

let _servicesStarted = false;

export async function startClientServices({ supabaseUrl, supabaseAnonKey } = {}) {
  if (_servicesStarted) return;
  _servicesStarted = true;

  // Configure Supabase from provided values or Vite env via configureSupabase
  configureSupabase({ url: supabaseUrl || import.meta.env.VITE_SUPABASE_URL, anonKey: supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY });

  try {
    // Start the offline sync engine — it's internally guarded but we call it once here
    // so that the wiring (online/offline listeners, visibility listeners) is set up in one place.
    await offline.syncEngine.start();
    console.debug('[clientServices] offline.syncEngine started');
  } catch (e) {
    console.warn('[clientServices] failed to start offline.syncEngine', e);
  }

  // Optionally refresh counters so the UI can show correct queue state early
  try {
    await offline.syncEngine.refreshCounters();
  } catch (_e) {}
}
