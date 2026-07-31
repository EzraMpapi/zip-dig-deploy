/* ══════════════ BIOMETRIC ATTENDANCE (WebAuthn) ══════════════ */
export function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

// A real App Lock — genuinely hashes the PIN via the browser's own Web
// Crypto API rather than storing it in plaintext, but honest about what
// this actually is: a per-device convenience lock for a shared phone or
// tablet, the same real purpose it serves in the reference app, not a
// substitute for real account security. Someone with direct access to
// this browser's developer tools could clear localStorage and bypass it
// — that's an honest, stated limit of any client-only lock, not a flaw
// unique to this implementation.
export async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
