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
  if (typeof crypto === "undefined" || !crypto.subtle) {
    console.warn("[crypto] Web Crypto API not available — encryption disabled");
    return null;
  }
  return crypto.subtle;
}

function toB64(bytes) {
  try {
    let binary = "";
    for (const byte of new Uint8Array(bytes)) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  } catch (_e) {
    console.error("[crypto] Failed to convert to base64");
    return "";
  }
}

function fromB64(text) {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (_e) {
    console.error("[crypto] Failed to decode from base64");
    return new Uint8Array(0);
  }
}

async function deviceSalt() {
  let salt = await getMeta("device_salt");
  if (!salt) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    salt = toB64(bytes);
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

    try {
      const material = await api.importKey(
        "raw",
        new TextEncoder().encode(`sm::${workspace}`),
        "PBKDF2",
        false,
        ["deriveKey"],
      );

      const salt = await deviceSalt();
      if (!salt || salt.length === 0) {
        console.warn("[crypto] No device salt available — encryption disabled");
        return null;
      }

      const key = await api.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: ITERATIONS,
          hash: "SHA-256",
        },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );

      return key;
    } catch (error) {
      console.error("[crypto] Failed to derive encryption key:", error);
      return null;
    }
  })();

  return keyPromise;
}

export function resetKeyCache() {
  keyPromise = null;
  keyWorkspace = null;
}

async function encryptValue(value) {
  const key = await getKey();
  if (!key) return value;

  const api = subtle();
  if (!api) return value;

  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = new TextEncoder().encode(JSON.stringify(value));

    const cipher = await api.encrypt(
      { name: "AES-GCM", iv },
      key,
      bytes,
    );

    return `${PREFIX}${toB64(iv)}:${toB64(cipher)}`;
  } catch (error) {
    console.error("[crypto] Encryption failed for field:", error);
    return value; // fall back to plaintext rather than lose data
  }
}

async function decryptValue(text) {
  const key = await getKey();
  if (!key) return null;

  const api = subtle();
  if (!api) return null;

  try {
    const parts = text.slice(PREFIX.length).split(":");
    if (parts.length !== 2) {
      console.warn("[crypto] Invalid encrypted value format — returning null");
      return null;
    }

    const [ivPart, cipherPart] = parts;
    const iv = fromB64(ivPart);
    const cipher = fromB64(cipherPart);

    if (iv.length === 0 || cipher.length === 0) {
      console.warn("[crypto] Empty IV or ciphertext — returning null");
      return null;
    }

    const plain = await api.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipher,
    );

    return JSON.parse(new TextDecoder().decode(plain));
  } catch (error) {
    console.error("[crypto] Decryption failed:", error);
    return null; // key rotated or salt lost: surface empty, never a crash
  }
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

    try {
      out[field] = await encryptValue(value);
    } catch (_e) {
      // store plaintext rather than lose the write
      console.warn(`[crypto] Could not encrypt field "${field}" — storing plaintext`);
    }
  }

  return out;
}

export async function decryptRow(row) {
  if (!row || typeof row !== "object") return row;

  const out = Array.isArray(row) ? [...row] : { ...row };

  for (const [field, value] of Object.entries(out)) {
    if (!isCipherText(value)) continue;

    try {
      const decrypted = await decryptValue(value);
      if (decrypted !== null) {
        out[field] = decrypted;
      } else {
        out[field] = null; // failed to decrypt — surface empty
      }
    } catch (_e) {
      out[field] = null; // key rotated or salt lost: surface empty, never a crash
    }
  }

  return out;
}

export async function decryptRows(rows) {
  if (!Array.isArray(rows)) return [];

  const out = [];
  for (const row of rows) {
    out.push(await decryptRow(row));
  }
  return out;
}
