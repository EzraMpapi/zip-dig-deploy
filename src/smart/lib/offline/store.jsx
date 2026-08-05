/* ══════════════════════════════════════════════════════════════════════════
   RECORD REPOSITORY — the local mirror of every table the app reads.

   One envelope shape for every row, so the workspace browser, the sync
   engine and export/backup all speak the same language:

     { key, table, module, id, data, updatedAt, syncState, deleted }

   `data` holds the row exactly as PostgREST returned it (with sensitive
   fields encrypted), which is what makes offline reads byte-compatible with
   online reads: modules never learn where a row came from.
   ══════════════════════════════════════════════════════════════════════════ */

import { decryptRows, encryptRow } from "./crypto.jsx";
import {
  STORE_RECORDS, countIndex, del, getAll, put, queryIndex, withStore,
} from "./idb.jsx";
import { moduleForTable } from "./registry.jsx";

export const SYNCED = "synced";
export const PENDING = "pending";
export const FAILED = "failed";

export function recordKey(table, id) {
  return `${table}::${id}`;
}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `loc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function primaryKey(row) {
  return row?.id ?? row?.uuid ?? row?.key ?? null;
}

function envelope(table, row, syncState) {
  const id = primaryKey(row) ?? newId();
  return {
    key: recordKey(table, id),
    table,
    module: moduleForTable(table),
    id: String(id),
    data: row,
    updatedAt: row?.updated_at || row?.created_at || new Date().toISOString(),
    syncState,
    deleted: false,
  };
}

/* Rows fetched from the server refresh the mirror, but never clobber a row
   the user changed offline — that pending edit is the newer truth until the
   sync engine has pushed it. */
export async function cacheRemoteRows(table, rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return 0;
  const prepared = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    prepared.push(envelope(table, await encryptRow(row), SYNCED));
  }
  if (!prepared.length) return 0;
  return withStore(STORE_RECORDS, "readwrite", async (store, p) => {
    let written = 0;
    for (const record of prepared) {
      const existing = await p(store.get(record.key));
      if (existing && existing.syncState !== SYNCED) continue;
      await p(store.put(record));
      written += 1;
    }
    return written;
  });
}

export async function putLocalRow(table, row, syncState = PENDING) {
  const record = envelope(table, await encryptRow(row), syncState);
  await put(STORE_RECORDS, record);
  return record;
}

export async function markRecordState(key, syncState) {
  await withStore(STORE_RECORDS, "readwrite", async (store, p) => {
    const existing = await p(store.get(key));
    if (existing) await p(store.put({ ...existing, syncState }));
  });
}

export async function tombstone(table, id) {
  const key = recordKey(table, id);
  await withStore(STORE_RECORDS, "readwrite", async (store, p) => {
    const existing = await p(store.get(key));
    await p(store.put({
      ...(existing || envelope(table, { id }, PENDING)),
      key, table, module: moduleForTable(table), id: String(id),
      deleted: true, syncState: PENDING, updatedAt: new Date().toISOString(),
    }));
  });
}

export async function hardDelete(table, id) {
  await del(STORE_RECORDS, recordKey(table, id));
}

/* ── local query engine ───────────────────────────────────────────────────
   Supports the operators the app's query builder actually emits (eq, in, gt,
   gte, lt, lte, like, is) plus ordering and paging. Reads go through the
   `byTable` index, so cost scales with the table, not the database. */

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function matchOne(value, op, target) {
  switch (op) {
    case "eq": return String(value) === target;
    case "neq": return String(value) !== target;
    case "gt": return compare(value, target) > 0;
    case "gte": return compare(value, target) >= 0;
    case "lt": return compare(value, target) < 0;
    case "lte": return compare(value, target) <= 0;
    case "like":
    case "ilike": return String(value ?? "").toLowerCase().includes(target.replace(/[%*]/g, "").toLowerCase());
    case "in": return target.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, "")).includes(String(value));
    case "is": return target === "null" ? value == null : String(value) === target;
    default: return true;
  }
}

export function matchesFilters(row, filters) {
  return filters.every(({ col, op, val }) => matchOne(row?.[col], op, val));
}

export async function readLocal(table, { filters = [], order = null, limit = Infinity, offset = 0 } = {}) {
  const range = IDBKeyRange.only(table);
  // Ordering and paging must be applied after filtering, so when the caller
  // sorts we read the filtered set and slice; unsorted reads page in-cursor.
  const paged = order ? {} : { offset, limit };
  const envelopes = await queryIndex(STORE_RECORDS, "byTable", range, {
    filter: (rec) => !rec.deleted && matchesFilters(rec.data, filters),
    ...paged,
  });
  let rows = await decryptRows(envelopes.map((rec) => rec.data));
  if (order) {
    const [col, dir] = String(order).split(".");
    rows.sort((a, b) => (dir === "desc" ? -compare(a?.[col], b?.[col]) : compare(a?.[col], b?.[col])));
    rows = rows.slice(offset, limit === Infinity ? undefined : offset + limit);
  }
  return rows;
}

export async function findLocalMatches(table, filters) {
  const envelopes = await queryIndex(STORE_RECORDS, "byTable", IDBKeyRange.only(table), {
    filter: (rec) => !rec.deleted && matchesFilters(rec.data, filters),
  });
  const out = [];
  for (const rec of envelopes) out.push({ ...rec, data: (await decryptRows([rec.data]))[0] });
  return out;
}

export function countTable(table) {
  return countIndex(STORE_RECORDS, "byTable", IDBKeyRange.only(table));
}

export function countPendingRecords() {
  return countIndex(STORE_RECORDS, "bySyncState", IDBKeyRange.only(PENDING));
}

/* Module-level summary for the workspace browser: tables, row counts and how
   many rows still await upload, grouped by logical module. */
export async function workspaceSummary() {
  const all = await getAll(STORE_RECORDS);
  const modules = new Map();
  for (const rec of all) {
    if (!modules.has(rec.module)) modules.set(rec.module, { id: rec.module, rows: 0, pending: 0, tables: new Map() });
    const mod = modules.get(rec.module);
    if (rec.deleted) mod.pending += 1;
    else {
      mod.rows += 1;
      if (rec.syncState !== SYNCED) mod.pending += 1;
    }
    mod.tables.set(rec.table, (mod.tables.get(rec.table) || 0) + (rec.deleted ? 0 : 1));
  }
  return [...modules.values()].map((mod) => ({
    ...mod,
    tables: [...mod.tables.entries()].map(([table, rows]) => ({ table, rows })).sort((a, b) => b.rows - a.rows),
  })).sort((a, b) => b.rows - a.rows);
}

export async function exportRecords(moduleId) {
  const all = await getAll(STORE_RECORDS);
  const scoped = moduleId ? all.filter((rec) => rec.module === moduleId) : all;
  const out = [];
  for (const rec of scoped) out.push({ ...rec, data: (await decryptRows([rec.data]))[0] });
  return out;
}

export async function importRecords(records) {
  let restored = 0;
  for (const rec of records || []) {
    if (!rec?.table || !rec?.data) continue;
    await putLocalRow(rec.table, rec.data, rec.syncState === SYNCED ? SYNCED : PENDING);
    restored += 1;
  }
  return restored;
}
