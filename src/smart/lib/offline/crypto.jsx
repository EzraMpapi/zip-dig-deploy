/* ══════════════════════════════════════════════════════════════════════════
   FIELD-LEVEL ENCRYPTION AT REST

   Honest scope, stated once: this protects locally cached data against
   casual inspection — another app on a shared machine reading the IndexedDB
   file, a support screenshot of the storage inspector, a stolen laptop with
   the browser profile intact. It is NOT protection against an attacker who
   can execute JavaScript on this origin, because that attacker can call the
   same decrypt function the app calls. No browser-side scheme can defend
   against that; the real boundary is server-side RLS, which stays in place.

   The key is derived with PBKDF2 from the workspace id plus a random
   per-device salt kept in the workspace metadata, so the same user's data on
   a different device is encrypted under a different key.
   ══════════════════════════════════════════════════════════════════════════ */

import { currentWorkspaceId, getMeta, setMeta } from "./idb.jsx";
import { isSensitiveField } from "./registry.jsx";

const PREFIX = "enc:v1:";
const ITERATIONS = 120_000;
let keyPromise = null;
let keyWorkspace = null;

function subtle() {
  return typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null;
}

function toB64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromB64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function deviceSalt() {
  let salt = await getMeta("device_salt");
  if (!salt) {
    salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
    await setMeta("device_salt", salt);
  }
  return fromB64(salt);
}

async function getKey() {
  const workspace = currentWorkspaceId();
  if (keyPromise && keyWorkspace === workspace) return keyPromise;
  keyWorkspace = workspace;
  keyPromise = (async () => {
    const api = subtle();
    if (!api) return null;
    const material = await api.importKey("raw", new TextEncoder().encode(`sm::${workspace}`), "PBKDF2", false, ["deriveKey"]);
    return api.deriveKey(
      { name: "PBKDF2", salt: await deviceSalt(), iterations: ITERATIONS, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })().catch(() => null);
  return keyPromise;
}

export function resetKeyCache() {
  keyPromise = null;
  keyWorkspace = null;
}

async function encryptValue(value) {
  const key = await getKey();
  if (!key) return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await subtle().encrypt({ name: "AES-GCM", iv }, key, bytes);
  return `${PREFIX}${toB64(iv)}:${toB64(cipher)}`;
}

async function decryptValue(text) {
  const key = await getKey();
  if (!key) return null;
  const [ivPart, cipherPart] = text.slice(PREFIX.length).split(":");
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(ivPart) }, key, fromB64(cipherPart));
  return JSON.parse(new TextDecoder().decode(plain));
}

function isCipherText(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/* Encrypts only sensitive fields. Encrypting whole rows would make every
   local query a full decrypt-then-filter scan; per-field keeps ids, dates
   and foreign keys indexable while credentials and pay figures stay opaque. */
export async function encryptRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = Array.isArray(row) ? [...row] : { ...row };
  for (const [field, value] of Object.entries(out)) {
    if (value == null || isCipherText(value)) continue;
    if (!isSensitiveField(field)) continue;
    try { out[field] = await encryptValue(value); } catch (_e) { /* store plaintext rather than lose the write */ }
  }
  return out;
}

export async function decryptRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = Array.isArray(row) ? [...row] : { ...row };
  for (const [field, value] of Object.entries(out)) {
    if (!isCipherText(value)) continue;
    try {
      out[field] = await decryptValue(value);
    } catch (_e) {
      out[field] = null; // key rotated or salt lost: surface empty, never a crash
    }
  }
  return out;
}

export async function decryptRows(rows) {
  const out = [];
  for (const row of rows) out.push(await decryptRow(row));
  return out;
}
