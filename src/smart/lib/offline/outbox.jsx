/* ══════════════════════════════════════════════════════════════════════════
   OUTBOX — the durable synchronization queue.

   Every write the app performs while the server is unreachable becomes one
   append-only entry here, in the order the user made it. Order matters: a
   customer must be inserted before the invoice that references it, so the
   engine drains strictly by sequence and stops at the first entry it cannot
   yet apply rather than reordering around it.

   Each entry records the operation, its payload, retry attempts, the last
   error and the timestamps the UI reports as "pending" / "failed".
   ══════════════════════════════════════════════════════════════════════════ */

import { encryptRow } from "./crypto.jsx";
import { STORE_OUTBOX, countIndex, del, getAll, put, queryIndex, withStore } from "./idb.jsx";
import { moduleForTable } from "./registry.jsx";

export const OP_INSERT = "insert";
export const OP_UPDATE = "update";
export const OP_DELETE = "delete";

export const QUEUED = "queued";
export const SYNCING = "syncing";
export const FAILED = "failed";
export const DONE = "done";

export const MAX_ATTEMPTS = 6;

export async function enqueue(entry) {
  const record = {
    table: entry.table,
    module: moduleForTable(entry.table),
    op: entry.op,
    recordId: entry.recordId ? String(entry.recordId) : null,
    filters: entry.filters || [],
    payload: entry.payload ? await encryptRow(entry.payload) : null,
    baseUpdatedAt: entry.baseUpdatedAt || null,
    status: QUEUED,
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    syncedAt: null,
  };
  const seq = await put(STORE_OUTBOX, record);
  return { ...record, seq };
}

/* Entries that are eligible to send now: queued, or previously failed but
   still inside the retry budget. Exponential backoff is applied by the
   engine, which owns the clock. */
export async function pendingEntries(limit = 200) {
  const entries = await queryIndex(STORE_OUTBOX, null, null, {
    filter: (entry) => entry.status !== DONE,
    limit,
  });
  return entries.sort((a, b) => a.seq - b.seq);
}

export function updateEntry(seq, patch) {
  return withStore(STORE_OUTBOX, "readwrite", async (store, p) => {
    const existing = await p(store.get(seq));
    if (!existing) return null;
    const next = { ...existing, ...patch };
    await p(store.put(next));
    return next;
  });
}

export function removeEntry(seq) {
  return del(STORE_OUTBOX, seq);
}

export async function queueStats() {
  const entries = await getAll(STORE_OUTBOX);
  const live = entries.filter((entry) => entry.status !== DONE);
  return {
    pending: live.filter((entry) => entry.status !== FAILED).length,
    failed: live.filter((entry) => entry.status === FAILED).length,
    total: live.length,
    oldest: live.length ? live.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), live[0].createdAt) : null,
  };
}

export function countQueue() {
  return countIndex(STORE_OUTBOX, null, null);
}

export function listQueue() {
  return getAll(STORE_OUTBOX);
}

export async function purgeCompleted() {
  const entries = await getAll(STORE_OUTBOX);
  for (const entry of entries) if (entry.status === DONE) await del(STORE_OUTBOX, entry.seq);
}

export function backoffMs(attempts) {
  return Math.min(60_000, 2 ** Math.max(0, attempts) * 1_000);
}
