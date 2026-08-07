/* ══════════════════════════════════════════════════════════════════════════
   SYNCHRONIZATION ENGINE

   Owns three responsibilities and nothing else: knowing whether the backend
   is reachable, draining the outbox in order when it is, and reporting state
   to the UI. It talks to the network through an injected transport, so it has
   no import cycle with the Supabase client and is testable with a fake.

   Duplicate prevention is a design property, not a reconciliation step: every
   offline insert carries a client-generated UUID as its primary key, so
   replaying the same queue entry twice writes the same row twice — the second
   write is a no-op upsert, not a second record.

   Conflicts resolve per field, not per row. An offline edit only ever
   replays the columns the user actually changed, so a stale local copy can
   never blank out a column someone else updated in the cloud meanwhile.
   ══════════════════════════════════════════════════════════════════════════ */

import { decryptRow } from "./crypto.jsx";
import { STORE_CONFLICTS, getMeta, put, setMeta } from "./idb.jsx";
import {
  DONE,
  FAILED,
  MAX_ATTEMPTS,
  OP_DELETE,
  OP_INSERT,
  OP_UPDATE,
  QUEUED,
  SYNCING,
  backoffMs,
  pendingEntries,
  queueStats,
  removeEntry,
  updateEntry,
} from "./outbox.jsx";
import {
  PENDING,
  SYNCED,
  cacheRemoteRows,
  hardDelete,
  markRecordState,
  recordKey,
} from "./store.jsx";

const listeners = new Set();
const RETRY_TICK_MS = 20_000;

let transport = null;
let enabled = false;
let timer = null;
let draining = false;
let nextAttemptAt = 0;

const state = {
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  reachable: true,
  syncing: false,
  pending: 0,
  failed: 0,
  conflicts: 0,
  lastSyncAt: null,
  lastError: null,
  mode: "online", // online | offline | syncing
};

function computeMode() {
  if (state.syncing) return "syncing";
  return state.online && state.reachable ? "online" : "offline";
}

function emit() {
  state.mode = computeMode();
  const snapshot = { ...state };
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (_e) {
      /* a bad subscriber must not stop sync */
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function getStatus() {
  return { ...state };
}

export function isOffline() {
  return !(state.online && state.reachable);
}

export function configureTransport(fn) {
  transport = fn;
}

/* Any backend failure — network, 5xx, auth, timeout — flips the engine to
   offline so the next write goes local instead of failing in the user's face.
   A single successful call flips it straight back. */
export function reportBackendFailure(error) {
  state.reachable = false;
  state.lastError = error ? String(error.message || error) : "Backend unreachable";
  emit();
  scheduleDrain(RETRY_TICK_MS);
}

export function reportBackendSuccess() {
  if (!state.reachable) {
    state.reachable = true;
    state.lastError = null;
    emit();
    scheduleDrain(300);
  }
}

export async function refreshCounters() {
  try {
    const stats = await queueStats();
    state.pending = stats.pending;
    state.failed = stats.failed;
    emit();
  } catch (_e) {
    /* counters are cosmetic */
  }
}

function scheduleDrain(delay) {
  if (!enabled || timer) return;
  timer = setTimeout(() => {
    timer = null;
    drain().catch(() => {});
  }, delay);
}

async function recordConflict(entry, remote, resolution) {
  try {
    await put(STORE_CONFLICTS, {
      table: entry.table,
      recordId: entry.recordId,
      resolution,
      remoteUpdatedAt: remote?.updated_at || null,
      localBase: entry.baseUpdatedAt,
      at: new Date().toISOString(),
    });
    state.conflicts += 1;
  } catch (_e) {
    /* conflict log is advisory */
  }
}

async function sendInsert(entry) {
  const payload = await decryptRow(entry.payload);
  const rows = await transport({ table: entry.table, method: "POST", body: payload });
  const saved = Array.isArray(rows) ? rows[0] : rows;
  await cacheRemoteRows(entry.table, saved || payload);
  if (entry.recordId) await markRecordState(recordKey(entry.table, entry.recordId), SYNCED);
}

async function sendUpdate(entry) {
  const patch = await decryptRow(entry.payload);
  let remote = null;
  try {
    const rows = await transport({
      table: entry.table,
      method: "GET",
      filters: entry.filters,
      select: "*",
    });
    remote = Array.isArray(rows) ? rows[0] : rows;
  } catch (_e) {
    /* if the pre-read fails, fall through to a plain patch */
  }

  if (
    remote &&
    entry.baseUpdatedAt &&
    remote.updated_at &&
    remote.updated_at > entry.baseUpdatedAt
  ) {
    // Cloud row moved on since this edit was captured. Replaying only the
    // changed columns keeps the remote's newer values for everything else.
    await recordConflict(entry, remote, "field-merge");
  }

  const rows = await transport({
    table: entry.table,
    method: "PATCH",
    filters: entry.filters,
    body: patch,
  });
  const saved = Array.isArray(rows) ? rows[0] : rows;
  if (saved) await cacheRemoteRows(entry.table, saved);
  if (entry.recordId) await markRecordState(recordKey(entry.table, entry.recordId), SYNCED);
}

async function sendDelete(entry) {
  await transport({ table: entry.table, method: "DELETE", filters: entry.filters });
  if (entry.recordId) await hardDelete(entry.table, entry.recordId);
}

async function sendEntry(entry) {
  if (entry.op === OP_INSERT) return sendInsert(entry);
  if (entry.op === OP_UPDATE) return sendUpdate(entry);
  if (entry.op === OP_DELETE) return sendDelete(entry);
  throw new Error(`Unknown queue operation: ${entry.op}`);
}

function isPermanent(error) {
  const status = error?.status;
  // 4xx other than auth/timeout won't succeed on retry: the payload itself is
  // rejected (missing column, constraint violation, RLS denial).
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 401 &&
    status !== 408 &&
    status !== 429
  );
}

export async function drain({ manual = false } = {}) {
  if (!transport || draining) return getStatus();
  if (!manual && Date.now() < nextAttemptAt) {
    scheduleDrain(RETRY_TICK_MS);
    return getStatus();
  }
  if (!state.online && !manual) return getStatus();

  draining = true;
  state.syncing = true;
  emit();
  let entries = [];
  try {
    entries = await pendingEntries();
  } catch (_e) {
    draining = false;
    state.syncing = false;
    emit();
    return getStatus();
  }

  let hitNetworkWall = false;
  for (const entry of entries) {
    if (entry.status === FAILED && entry.attempts >= MAX_ATTEMPTS) continue;
    if (hitNetworkWall) break;
    await updateEntry(entry.seq, { status: SYNCING });
    try {
      await sendEntry(entry);
      await updateEntry(entry.seq, {
        status: DONE,
        syncedAt: new Date().toISOString(),
        lastError: null,
      });
      await removeEntry(entry.seq);
      reportBackendSuccess();
    } catch (error) {
      const attempts = (entry.attempts || 0) + 1;
      const permanent = isPermanent(error);
      await updateEntry(entry.seq, {
        status: permanent || attempts >= MAX_ATTEMPTS ? FAILED : QUEUED,
        attempts,
        lastError: String(error?.message || error),
      });
      if (entry.recordId) await markRecordState(recordKey(entry.table, entry.recordId), PENDING);
      if (!permanent) {
        // Network-shaped failure: stop here so later entries keep their order
        // and retry after backoff instead of hammering a down backend.
        hitNetworkWall = true;
        state.reachable = false;
        state.lastError = String(error?.message || error);
        nextAttemptAt = Date.now() + backoffMs(attempts);
      }
    }
  }

  state.syncing = false;
  if (!hitNetworkWall) {
    state.reachable = true;
    state.lastSyncAt = new Date().toISOString();
    await setMeta("last_sync_at", state.lastSyncAt);
    nextAttemptAt = 0;
  }
  draining = false;
  await refreshCounters();
  if (hitNetworkWall) scheduleDrain(RETRY_TICK_MS);
  return getStatus();
}

export function syncNow() {
  return drain({ manual: true });
}

export async function start() {
  if (enabled) return;
  enabled = true;
  state.lastSyncAt = await getMeta("last_sync_at", null);
  await refreshCounters();
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      state.online = true;
      state.reachable = true;
      nextAttemptAt = 0;
      emit();
      scheduleDrain(500);
    });
    window.addEventListener("offline", () => {
      state.online = false;
      emit();
    });
    // Coming back to a tab after sleep is the most common moment for a queue
    // to be drainable again without any online/offline event firing.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleDrain(1_000);
    });
  }
  emit();
  scheduleDrain(2_000);
}

export function stop() {
  enabled = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
