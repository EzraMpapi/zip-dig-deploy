import * as offline from "./offline/index.jsx";
/* ────────────────────────────────────────────────────────────────
   SUPABASE CLIENT — hand-rolled, fetch‑based (no SDK)

   Credentials come from Vite env vars so real keys are never committed. Set
   them in .env locally and in Netlify/Vercel → Environment Variables for
   deploys. The fallbacks keep the demo project working, so a fresh clone
   still runs with `npm install && npm run dev`.
   ──────────────────────────────────────────────────────────────── */

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

// Do NOT hardcode any real keys here. Use env vars or call configureSupabase
// from a server or runtime initializer.
let SUPABASE_URL = ENV.VITE_SUPABASE_URL || "https://rlhngsrihahhyxnjxrxm.supabase.co";
let SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY || "";

export function configureSupabase({ url, anonKey } = {}) {
  if (url) SUPABASE_URL = url;
  if (anonKey) SUPABASE_ANON_KEY = anonKey;
  ensureTransportConfigured();
  // keep IS_CONFIGURED in sync
  IS_CONFIGURED = isSupabaseConfigured();
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

// ---- ADDED: IS_CONFIGURED as a live binding ----
export let IS_CONFIGURED = isSupabaseConfigured();

// ---- ADDED: auth functions ----
export async function authGetUser() {
  const token =
    typeof window !== "undefined" ? window.localStorage?.getItem("bs_access_token") : null;
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function authSignOut() {
  if (typeof window !== "undefined") {
    window.localStorage?.removeItem("bs_access_token");
  }
  return { success: true };
}
// ---- end of additions ----

export function authHeaders() {
  const token =
    (typeof window !== "undefined" && window.localStorage?.getItem("bs_access_token")) ||
    SUPABASE_ANON_KEY || "";
  return {
    apikey: SUPABASE_ANON_KEY || "",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

const REQUEST_TIMEOUT_MS = 12_000;

function parseFilters(search) {
  const filters = [];
  for (const [col, raw] of search.entries()) {
    if (col === "select" || col === "order" || col === "limit" || col === "offset") continue;
    const idx = String(raw).indexOf(".");
    if (idx === -1) {
      filters.push({ col, op: "eq", val: String(raw) });
      continue;
    }
    filters.push({ col, op: raw.slice(0, idx), val: raw.slice(idx + 1) });
  }
  return filters;
}

function filtersToSearch(filters = []) {
  const search = new URLSearchParams();
  for (const { col, op, val } of filters) search.append(col, `${op}.${val}`);
  return search;
}

function isBackendUnreachable(status) {
  return (
    status == null ||
    status >= 500 ||
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 429
  );
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
      try {
        err = await res.json();
      } catch (_e) {
        /* non-JSON error body */
      }
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

/* The sync engine reaches the network only through this transport. */
let transportConfigured = false;
function ensureTransportConfigured() {
  if (transportConfigured) return;
  offline.syncEngine.configureTransport(rawRequest);
  transportConfigured = true;
}

// Configure transport at module load so existing code that imports sb() works
// without any explicit configureSupabase() call. This does not set any keys.
ensureTransportConfigured();

// Minimal chainable query builder over PostgREST — mirrors previous implementation
export function sb(table) {
  let path = `${SUPABASE_URL}/rest/v1/${table}`;
  const params = new URLSearchParams();
  let method = "GET";
  let body = null;
  let single = false;
  let payload = null;

  function splitSelect(sel) {
    const out = [];
    let depth = 0,
      cur = "";
    for (const ch of sel) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
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
      return single ? (Array.isArray(saved) ? saved[0] : saved) : Array.isArray(saved) ? saved : [saved];
    }
    if (method === "PATCH") return shape(await offline.applyOfflineUpdate(table, filters, payload || {}));
    return shape(await offline.applyOfflineDelete(table, filters));
  }

  async function execute(selectOverride, attempt) {
    const search = new URLSearchParams(params);
    let sel = selectOverride || search.get("select") || "*";
    if (method === "GET") {
      // if offline, serve local mirror
      if (offline.syncEngine.isOffline()) return localRead(search);
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
      offline.syncEngine.reportBackendFailure(networkError);
      return method === "GET" ? localRead(search) : localWrite(search);
    }

    if (res.ok) {
      offline.syncEngine.reportBackendSuccess();
      const text = await res.text();
      const data = text ? JSON.parse(text) : [];
      const rows = Array.isArray(data) ? data : [data];
      offline.cacheRows(table, rows);
      return single ? rows[0] : rows;
    }

    let err = {};
    try {
      err = await res.json();
    } catch (_e) {
      /* non-JSON */
    }

    const embedProblem = err.code === "PGRST200" || err.code === "PGRST100";
    if (method === "GET" && embedProblem && attempt < 2 && sel.includes("(")) {
      const flat = splitSelect(sel).filter((p) => !p.includes("(")).join(",") || "*";
      console.warn(`[supabase] ${table}: unresolved embed dropped — using select "${flat}"`);
      return execute(flat, attempt + 1);
    }

    if (method === "GET" && err.code === "42703" && search.has("order")) {
      console.warn(`[supabase] ${table}: sort column missing — retrying unordered.`);
      return execute(selectOverride, attempt + 1);
    }

    if (method === "GET" && (res.status === 404 || err.code === "42P01")) {
      console.warn(`[supabase] ${table}: not present in this project — serving local workspace data.`);
      return localRead(search);
    }

    if (isBackendUnreachable(res.status)) {
      offline.syncEngine.reportBackendFailure(new Error(err.message || `HTTP ${res.status}`));
      return method === "GET" ? localRead(search) : localWrite(search);
    }

    if (method === "GET") {
      console.warn(`[supabase] ${table}: read failed (${res.status}) — ${err.message || "unknown error"}`);
      const local = await localRead(search);
      return Array.isArray(local) && local.length ? local : empty();
    }

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
    then(resolve, reject) {
      return builder.run().then(resolve, reject);
    },
  };
  return builder;
        }
