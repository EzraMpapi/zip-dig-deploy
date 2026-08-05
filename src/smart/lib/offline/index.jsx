/* ══════════════════════════════════════════════════════════════════════════
   OFFLINE-FIRST DATA LAYER — public API

   The whole point of this module is that the 22 feature modules above it
   don't change at all. They keep calling sb("table").select().eq().run();
   this layer decides whether that call resolves from the cloud or from the
   local workspace, and guarantees a write is never lost either way.

   Read path : try cloud → cache result locally → on any failure, serve the
               local mirror (a stale row beats an empty screen).
   Write path: cloud when reachable, then mirror locally; otherwise apply
               locally, queue the operation, and return the row the caller
               expects so the UI updates exactly as it does online.
   ══════════════════════════════════════════════════════════════════════════ */

import { hasIndexedDB, deleteWorkspaceDatabase, setWorkspaceId, currentWorkspaceId } from "./idb.jsx";
import { resetKeyCache } from "./crypto.jsx";
import { WORKSPACE_MODULES, moduleForTable, moduleLabel } from "./registry.jsx";
import {
  OP_DELETE, OP_INSERT, OP_UPDATE, enqueue, listQueue, purgeCompleted, queueStats,
} from "./outbox.jsx";
import {
  PENDING, SYNCED, cacheRemoteRows, countTable, exportRecords, findLocalMatches,
  importRecords, newId, putLocalRow, readLocal, tombstone, workspaceSummary,
} from "./store.jsx";
import * as sync from "./sync.jsx";

export { WORKSPACE_MODULES, moduleForTable, moduleLabel };
export const syncEngine = sync;

let available = hasIndexedDB();

export function offlineAvailable() {
  return available;
}

function disable(error) {
  available = false;
  console.warn("[offline] local persistence unavailable — falling back to network-only:", error?.message || error);
}

async function guard(fn, fallback) {
  if (!available) return fallback;
  try {
    return await fn();
  } catch (error) {
    if (String(error?.name) === "QuotaExceededError") {
      console.warn("[offline] local storage quota reached — older cache entries must be exported or cleared.");
      return fallback;
    }
    disable(error);
    return fallback;
  }
}

/* ── workspace lifecycle ─────────────────────────────────────────────────── */

export async function openWorkspace(userId) {
  const switched = setWorkspaceId(userId);
  if (switched) resetKeyCache();
  await guard(() => sync.start(), null);
  return currentWorkspaceId();
}

export function workspaceId() {
  return currentWorkspaceId();
}

export async function resetWorkspace() {
  await guard(() => deleteWorkspaceDatabase(), null);
  resetKeyCache();
  await guard(() => sync.refreshCounters(), null);
}

/* ── read path ───────────────────────────────────────────────────────────── */

export function cacheRows(table, rows) {
  return guard(() => cacheRemoteRows(table, rows), 0);
}

export function readOffline(table, query) {
  return guard(() => readLocal(table, query), []);
}

/* ── write path ──────────────────────────────────────────────────────────── */

function nowIso() {
  return new Date().toISOString();
}

/* Client-generated UUIDs are what make offline inserts safe to replay and
   safe to reference: a child row created offline can point at its parent's
   final primary key immediately, so relationships survive the sync. */
function stampInsert(table, row) {
  const stamped = { ...row };
  if (stamped.id == null) stamped.id = newId();
  if (stamped.created_at == null) stamped.created_at = nowIso();
  stamped.updated_at = stamped.updated_at || stamped.created_at;
  return stamped;
}

export async function applyOfflineInsert(table, body) {
  const rows = (Array.isArray(body) ? body : [body]).map((row) => stampInsert(table, row));
  await guard(async () => {
    for (const row of rows) {
      await putLocalRow(table, row, PENDING);
      await enqueue({ table, op: OP_INSERT, recordId: row.id, payload: row });
    }
    await sync.refreshCounters();
  }, null);
  return Array.isArray(body) ? rows : rows[0];
}

export async function applyOfflineUpdate(table, filters, patch) {
  const stamped = { ...patch, updated_at: patch.updated_at || nowIso() };
  const updated = await guard(async () => {
    const matches = await findLocalMatches(table, filters);
    const out = [];
    for (const match of matches) {
      const merged = { ...match.data, ...stamped };
      await putLocalRow(table, merged, PENDING);
      await enqueue({
        table, op: OP_UPDATE, recordId: match.id, filters,
        payload: stamped, baseUpdatedAt: match.data?.updated_at || match.updatedAt,
      });
      out.push(merged);
    }
    if (!out.length) {
      // Nothing cached to patch (module never loaded online): still queue the
      // operation so the user's edit reaches the cloud, and return the patch.
      await enqueue({ table, op: OP_UPDATE, filters, payload: stamped });
      out.push(stamped);
    }
    await sync.refreshCounters();
    return out;
  }, [stamped]);
  return updated;
}

export async function applyOfflineDelete(table, filters) {
  const removed = await guard(async () => {
    const matches = await findLocalMatches(table, filters);
    for (const match of matches) {
      await tombstone(table, match.id);
      await enqueue({ table, op: OP_DELETE, recordId: match.id, filters });
    }
    if (!matches.length) await enqueue({ table, op: OP_DELETE, filters });
    await sync.refreshCounters();
    return matches.map((m) => m.data);
  }, []);
  return removed;
}

/* ── workspace browser, backup and restore ───────────────────────────────── */

export function summary() {
  return guard(() => workspaceSummary(), []);
}

export function tableCount(table) {
  return guard(() => countTable(table), 0);
}

export function queue() {
  return guard(() => listQueue(), []);
}

export function stats() {
  return guard(() => queueStats(), { pending: 0, failed: 0, total: 0, oldest: null });
}

export function clearCompletedQueue() {
  return guard(() => purgeCompleted(), null);
}

export async function exportWorkspace(moduleId) {
  const records = await guard(() => exportRecords(moduleId), []);
  return {
    format: "smart-manager-offline-workspace",
    version: 1,
    workspace: currentWorkspaceId(),
    module: moduleId || "all",
    exportedAt: nowIso(),
    records,
  };
}

export async function importWorkspace(backup) {
  if (!backup || backup.format !== "smart-manager-offline-workspace") {
    throw new Error("Not a Smart Manager workspace backup file.");
  }
  const restored = await guard(() => importRecords(backup.records), 0);
  await guard(() => sync.refreshCounters(), null);
  return restored;
}

export const SYNC_STATES = { PENDING, SYNCED };
