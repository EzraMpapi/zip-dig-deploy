import {  } from "lucide-react";
/* ──────────────────────────────────────────────────────────────────────────
   SUPABASE CLIENT — hand-rolled, fetch-based (no SDK)

   Credentials come from Vite env vars so real keys are never committed. Set
   them in .env locally and in Netlify/Vercel → Environment Variables for
   deploys. The fallbacks keep the demo project working, so a fresh clone
   still runs with `npm install && npm run dev`.
   ────────────────────────────────────────────────────────────────────────── */

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const SUPABASE_URL =
  ENV.VITE_SUPABASE_URL || "https://rlhngsrihahhyxnjxrxm.supabase.co";

export const SUPABASE_ANON_KEY =
  ENV.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsaG5nc3JpaGFoaHl4bmp4cnhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NjI0NzMsImV4cCI6MjEwMDAzODQ3M30.J3M1ELTb1dEoKx4tQfn_Yk7H15HIoxIW4PI3dyWYEHE";

export const IS_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* Mutable module state — writers must use the setter, never `DEMO_OVERRIDE = x`,
   because ES modules forbid assigning to an imported binding. */
export let DEMO_OVERRIDE = false;
export function setDemoOverride(v) { DEMO_OVERRIDE = v; }

export function authHeaders() {
  const token = (typeof window !== "undefined" && window.localStorage?.getItem("bs_access_token")) || SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// Real Supabase Auth REST calls — the actual GoTrue endpoints every
// supabase-js client calls under the hood, hit directly with fetch() the
// same way sb() hits PostgREST directly. Only meaningful when IS_CONFIGURED
// (a real Supabase project is connected); LoginPage/SignupPage below
// branch on that constant and simulate the flow locally in demo mode
// rather than pretending to authenticate against a backend that isn't there.
export async function authSignUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Sign up failed.");
  return data; // { access_token, refresh_token, user } once email confirmation is satisfied, or { user } if a project requires confirmation first
}

export async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Incorrect email or password.");
  return data; // { access_token, refresh_token, user }
}

export async function authSignOut(accessToken) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
  } catch (_e) { /* the local session is cleared regardless of whether the server call succeeds */ }
}

// Identifies who a stored access token actually belongs to — the real
// Supabase Auth endpoint for exactly this, used to resume a session on
// page load without re-prompting for a password every reload.
export async function authGetUser(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Session expired");
  return res.json();
}

// Real OAuth sign-in — redirects the browser to Supabase's actual
// /authorize endpoint for the named provider (google, azure, or apple).
// This call itself is genuine and correct; whether it actually reaches a
// working consent screen depends entirely on that provider being enabled
// in this project's Supabase dashboard (Authentication > Providers) with
// a real OAuth client ID and secret from Google Cloud Console, Azure AD,
// or Apple's own developer portal — none of which this codebase can
// create. Google and Microsoft (Azure) both have free tiers for this;
// Apple requires a paid Apple Developer account, the one provider here
// with a real cost attached before it can be turned on at all.
export function authSignInWithOAuth(provider) {
  const redirectTo = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
}

// Calls the two SECURITY DEFINER functions added to the schema
// (create_company_and_owner, join_company_with_code) via PostgREST's RPC
// endpoint — the correct, safe way to expose a multi-step, atomic
// operation to a client without granting raw table INSERT.
export async function callRpc(name, params, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error_description || `${name} failed.`);
  return data;
}

/* Session-level schema memory. A connected Supabase project may not carry
   every optional table, foreign key or sort column this app knows how to
   read; once a shape is proven unsupported we remember it so remounting a
   module doesn't re-issue a request we already know will fail. */
const SELECT_FALLBACK = new Map(); // "table|select" → working select string
const ORDERLESS = new Set();       // tables whose sort column doesn't exist
const DEAD_TABLES = new Set();     // tables absent from this project

const REQUEST_TIMEOUT_MS = 12_000;

/* Filters carried on a PostgREST query string ("customer_id=eq.7") in the
   structured form the offline layer needs to run the same predicate against
   the local mirror, and the sync engine needs to replay the write later. */
function parseFilters(search) {
  const filters = [];
  for (const [col, raw] of search.entries()) {
    if (col === "select" || col === "order" || col === "limit" || col === "offset") continue;
    const idx = String(raw).indexOf(".");
    if (idx === -1) { filters.push({ col, op: "eq", val: String(raw) }); continue; }
    filters.push({ col, op: raw.slice(0, idx), val: raw.slice(idx + 1) });
  }
  return filters;
}

function filtersToSearch(filters = []) {
  const search = new URLSearchParams();
  for (const { col, op, val } of filters) search.append(col, `${op}.${val}`);
  return search;
}

/* A network failure, timeout, 5xx, or expired token are all the same event to
   the app: the backend is not answering, so work continues locally. Only a
   definite rejection of the payload itself (4xx that isn't auth/throttling)
   is a real error the caller should see. */
function isBackendUnreachable(status) {
  return status == null || status >= 500 || status === 401 || status === 403 || status === 408 || status === 429;
}

async function rawRequest({ table, method = "GET", filters = [], body = null, select = null, order = null }) {
  const search = filtersToSearch(filters);
  if (select) search.set("select", select);
  if (order) search.set("order", order);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${search.toString()}`, {
      method,
      headers: { ...authHeaders(), Prefer: method === "GET" ? undefined : "return=representation" },
      body: body == null ? null : JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) {
      let err = {};
      try { err = await res.json(); } catch (_e) { /* non-JSON error body */ }
      const error = new Error(err.message || `Supabase ${method} ${table} failed: ${res.status}`);
      error.status = res.status;
      error.code = err.code;
      throw error;
    }
    if (res.status === 204) return [];
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* The sync engine reaches the network only through this transport, which
   keeps it free of any import cycle with this module and makes it testable
   against a fake sender. */
offline.syncEngine.configureTransport(rawRequest);

// Minimal chainable query builder over PostgREST, mirroring the shape of the
// official supabase-js client closely enough that swapping later is trivial.
// Every call now runs through the offline-first layer: reads fall back to the
// local workspace mirror, writes fall back to the local workspace plus the
// synchronization queue. Modules above this file are unchanged.
export function sb(table) {
  let path = `${SUPABASE_URL}/rest/v1/${table}`;
  const params = new URLSearchParams();
  let method = "GET";
  let body = null;
  let single = false;
  let payload = null;

  // Splits a PostgREST select string on top-level commas only, so embedded
  // relations like "pos_returns(*,pos_return_items(*))" stay intact.
  function splitSelect(sel) {
    const out = [];
    let depth = 0, cur = "";
    for (const ch of sel) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  const empty = () => (single ? undefined : []);
  const shape = (rows) => (single ? rows[0] : rows);

  async function localRead(search) {
    const rows = await offline.readOffline(table, {
      filters: parseFilters(search),
      order: search.get("order"),
      limit: single ? 1 : Infinity,
    });
    return shape(rows);
  }

  async function localWrite(search) {
    const filters = parseFilters(search);
    if (method === "POST") {
      const saved = await offline.applyOfflineInsert(table, payload);
      return single ? (Array.isArray(saved) ? saved[0] : saved) : (Array.isArray(saved) ? saved : [saved]);
    }
    if (method === "PATCH") return shape(await offline.applyOfflineUpdate(table, filters, payload || {}));
    return shape(await offline.applyOfflineDelete(table, filters));
  }

  async function execute(selectOverride, attempt) {
    const search = new URLSearchParams(params);
    let sel = selectOverride || search.get("select") || "*";
    if (method === "GET") {
      const cached = SELECT_FALLBACK.get(`${table}|${sel}`);
      if (cached) sel = cached;
      if (ORDERLESS.has(table)) search.delete("order");
      // A table this project doesn't have, or a backend that isn't answering:
      // serve the local mirror rather than an empty screen.
      if (DEAD_TABLES.has(table) || offline.syncEngine.isOffline()) return localRead(search);
    } else if (offline.syncEngine.isOffline()) {
      return localWrite(search);
    }
    if (search.has("select") || selectOverride) search.set("select", sel);

    let res;
    try {
      res = await fetch(`${path}?${search.toString()}`, {
        method,
        headers: {
          ...authHeaders(),
          Prefer: method === "GET" ? undefined : "return=representation",
        },
        body,
      });
    } catch (networkError) {
      // Genuine transport failure (offline, DNS, CORS, aborted): switch the
      // whole app to offline mode and complete the operation locally.
      offline.syncEngine.reportBackendFailure(networkError);
      return method === "GET" ? localRead(search) : localWrite(search);
    }

    if (res.ok) {
      offline.syncEngine.reportBackendSuccess();
      const text = await res.text();
      const data = text ? JSON.parse(text) : [];
      const rows = Array.isArray(data) ? data : [data];
      // Every successful read and write refreshes the local mirror, so the
      // next offline session starts from real data, not an empty database.
      offline.cacheRows(table, rows);
      return single ? rows[0] : rows;
    }

    let err = {};
    try { err = await res.json(); } catch (_e) { /* non-JSON error body */ }

    // Unresolvable embed (missing child table or foreign key): retry flat.
    const embedProblem = err.code === "PGRST200" || err.code === "PGRST100";
    if (method === "GET" && embedProblem && attempt < 2 && sel.includes("(")) {
      const flat = splitSelect(sel).filter((p) => !p.includes("(")).join(",") || "*";
      SELECT_FALLBACK.set(`${table}|${selectOverride || params.get("select") || "*"}`, flat);
      console.warn(`[supabase] ${table}: unresolved embed dropped — using select "${flat}"`);
      return execute(flat, attempt + 1);
    }

    // Sort column absent from this project's table: retry unordered rather
    // than failing the read outright.
    if (method === "GET" && err.code === "42703" && search.has("order")) {
      ORDERLESS.add(table);
      console.warn(`[supabase] ${table}: ${err.message} — retrying without ordering.`);
      return execute(selectOverride, attempt + 1);
    }

    // Table not present in this project's schema: behave like an empty set
    // instead of tearing down the screen that reads it — but check the local
    // workspace first, because the user may have created rows offline.
    if (method === "GET" && (res.status === 404 || err.code === "42P01")) {
      DEAD_TABLES.add(table);
      console.warn(`[supabase] ${table}: not present in this project — serving local workspace data.`);
      return localRead(search);
    }

    if (isBackendUnreachable(res.status)) {
      offline.syncEngine.reportBackendFailure(new Error(err.message || `HTTP ${res.status}`));
      return method === "GET" ? localRead(search) : localWrite(search);
    }

    // Any other read failure (missing column in an explicit projection, RLS
    // restriction) still shouldn't blank a whole module — fall back to the
    // local mirror and note it in the console.
    if (method === "GET") {
      console.warn(`[supabase] ${table}: read failed (${res.status}) — ${err.message || "unknown error"}`);
      const local = await localRead(search);
      return Array.isArray(local) && local.length ? local : empty();
    }

    // A definite rejection of the payload itself. Queueing it would mean
    // retrying a write that can never succeed, so the caller is told.
    const error = new Error(err.message || `Supabase ${method} ${table} failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }


  const builder = {
    select(cols = "*") {
      params.set("select", cols);
      return builder;
    },
    eq(col, val) {
      params.append(col, `eq.${val}`);
      return builder;
    },
    order(col, { ascending = true } = {}) {
      params.set("order", `${col}.${ascending ? "asc" : "desc"}`);
      return builder;
    },
    insert(row) {
      method = "POST";
      payload = row;
      body = JSON.stringify(row);
      return builder;
    },
    update(patch) {
      method = "PATCH";
      payload = patch;
      body = JSON.stringify(patch);
      return builder;
    },
    delete() {
      method = "DELETE";
      return builder;
    },
    single() {
      single = true;
      return builder;
    },
    async run() {
      return execute(params.get("select"), 0);
    },



    // allow `await sb(table).select().eq(...)` directly, like supabase-js
    then(resolve, reject) {
      return builder.run().then(resolve, reject);
    },
  };
  return builder;
}

