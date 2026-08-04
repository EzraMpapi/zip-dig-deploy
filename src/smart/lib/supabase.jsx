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

// Minimal chainable query builder over PostgREST, mirroring the shape of the
// official supabase-js client closely enough that swapping later is trivial.
export function sb(table) {
  let path = `${SUPABASE_URL}/rest/v1/${table}`;
  const params = new URLSearchParams();
  let method = "GET";
  let body = null;
  let single = false;

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

  async function execute(selectOverride, attempt) {
    const search = new URLSearchParams(params);
    if (selectOverride) search.set("select", selectOverride);
    const res = await fetch(`${path}?${search.toString()}`, {
      method,
      headers: {
        ...authHeaders(),
        Prefer: method === "GET" ? undefined : "return=representation",
      },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return single ? data[0] : data;
    }

    let err = {};
    try { err = await res.json(); } catch (_e) { /* non-JSON error body */ }

    // Unresolvable embed (missing child table or foreign key): retry flat.
    const sel = selectOverride || "*";
    const embedProblem = err.code === "PGRST200" || err.code === "PGRST100";
    if (method === "GET" && embedProblem && attempt < 2 && sel.includes("(")) {
      const flat = splitSelect(sel).filter((p) => !p.includes("(")).join(",") || "*";
      if (typeof console !== "undefined") {
        console.warn(`[supabase] ${table}: dropping unresolved embeds from select — using "${flat}"`);
      }
      return execute(flat, attempt + 1);
    }

    // Table not present in this project's schema: behave like an empty set
    // instead of tearing down the screen that reads it.
    if (method === "GET" && (res.status === 404 || err.code === "42P01")) {
      if (typeof console !== "undefined") {
        console.warn(`[supabase] ${table}: not found in this project — treating as empty.`);
      }
      return single ? undefined : [];
    }

    throw new Error(err.message || `Supabase ${method} ${table} failed: ${res.status}`);
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
      body = JSON.stringify(row);
      return builder;
    },
    update(patch) {
      method = "PATCH";
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

    // Live-data resilience: a real Supabase project can legitimately be
    // missing an optional child table (or its foreign key), which makes
    // PostgREST reject the whole request over one embed. Rather than
    // failing an entire screen, drop the embeds that can't be resolved and
    // retry with the flat row set — the mappers already treat nested
    // arrays as optional.

    // allow `await sb(table).select().eq(...)` directly, like supabase-js
    then(resolve, reject) {
      return builder.run().then(resolve, reject);
    },
  };
  return builder;
}
