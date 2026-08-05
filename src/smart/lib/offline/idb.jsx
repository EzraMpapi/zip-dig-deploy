/* ══════════════════════════════════════════════════════════════════════════
   INDEXEDDB WRAPPER

   IndexedDB — not localStorage — because enterprise datasets run to tens of
   thousands of rows with attachments: localStorage is a synchronous ~5 MB
   string store with no indexes, so every read would deserialize the whole
   dataset on the main thread. This wrapper is deliberately small: open,
   transaction helpers, and index-backed cursor reads. Everything above it
   (repository, outbox, sync) is plain testable logic.

   Each user gets a physically separate database (`smart_manager::<userId>`),
   which is the strongest isolation the browser offers without a server: no
   query can cross workspaces because no query can reach another database.
   ══════════════════════════════════════════════════════════════════════════ */

export const STORE_RECORDS = "records";
export const STORE_OUTBOX = "outbox";
export const STORE_META = "meta";
export const STORE_ATTACHMENTS = "attachments";
export const STORE_CONFLICTS = "conflicts";

const DB_VERSION = 1;
const DB_PREFIX = "smart_manager";

let workspaceId = "anonymous";
let dbPromise = null;

export function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

export function currentWorkspaceId() {
  return workspaceId;
}

export function dbName() {
  return `${DB_PREFIX}::${workspaceId}`;
}

/* Switching users closes the previous handle so the next open targets the new
   user's database. Called once from the shell when a session resolves. */
export function setWorkspaceId(id) {
  const next = id ? String(id) : "anonymous";
  if (next === workspaceId) return false;
  workspaceId = next;
  if (dbPromise) {
    dbPromise.then((db) => { try { db.close(); } catch (_e) { /* already closed */ } }).catch(() => {});
  }
  dbPromise = null;
  return true;
}

function upgrade(db) {
  if (!db.objectStoreNames.contains(STORE_RECORDS)) {
    const records = db.createObjectStore(STORE_RECORDS, { keyPath: "key" });
    records.createIndex("byTable", "table");
    records.createIndex("byModule", "module");
    records.createIndex("bySyncState", "syncState");
    records.createIndex("byUpdatedAt", "updatedAt");
  }
  if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
    const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: "seq", autoIncrement: true });
    outbox.createIndex("byStatus", "status");
    outbox.createIndex("byTable", "table");
  }
  if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "k" });
  if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
    const files = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: "id" });
    files.createIndex("byRecord", "recordKey");
  }
  if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
    db.createObjectStore(STORE_CONFLICTS, { keyPath: "id", autoIncrement: true });
  }
}

export function openDB() {
  if (!hasIndexedDB()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName(), DB_VERSION);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { try { db.close(); } catch (_e) {} dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("Failed to open local database"));
      request.onblocked = () => reject(new Error("Local database upgrade blocked by another tab"));
    }).catch((error) => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withStore(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Local transaction aborted"));
    Promise.resolve(fn(tx.objectStore(storeName), promisify))
      .then((value) => { result = value; })
      .catch((error) => { try { tx.abort(); } catch (_e) {} reject(error); });
  });
}

export function put(storeName, value) {
  return withStore(storeName, "readwrite", (store, p) => p(store.put(value)));
}

export function putMany(storeName, values) {
  return withStore(storeName, "readwrite", async (store, p) => {
    for (const value of values) await p(store.put(value));
    return values.length;
  });
}

export function get(storeName, key) {
  return withStore(storeName, "readonly", (store, p) => p(store.get(key)));
}

export function del(storeName, key) {
  return withStore(storeName, "readwrite", (store, p) => p(store.delete(key)));
}

export function clearStore(storeName) {
  return withStore(storeName, "readwrite", (store, p) => p(store.clear()));
}

export function getAll(storeName) {
  return withStore(storeName, "readonly", (store, p) => p(store.getAll()));
}

/* Index-backed read with an optional predicate, page offset and limit. The
   cursor stops as soon as the page is full, so a 50-row page never
   materializes a 50 000-row table. */
export function queryIndex(storeName, indexName, keyRange, { filter, offset = 0, limit = Infinity } = {}) {
  return withStore(storeName, "readonly", (store) => {
    const source = indexName ? store.index(indexName) : store;
    return new Promise((resolve, reject) => {
      const out = [];
      let skipped = 0;
      const request = source.openCursor(keyRange);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || out.length >= limit) return resolve(out);
        const value = cursor.value;
        if (!filter || filter(value)) {
          if (skipped >= offset) out.push(value);
          else skipped += 1;
        }
        cursor.continue();
      };
    });
  });
}

export function countIndex(storeName, indexName, keyRange) {
  return withStore(storeName, "readonly", (store, p) =>
    p(indexName ? store.index(indexName).count(keyRange) : store.count(keyRange)),
  );
}

export async function getMeta(key, fallback) {
  try {
    const row = await get(STORE_META, key);
    return row ? row.v : fallback;
  } catch (_e) {
    return fallback;
  }
}

export async function setMeta(key, value) {
  try {
    await put(STORE_META, { k: key, v: value });
  } catch (_e) { /* meta is advisory: never fail a write because of it */ }
}

export async function deleteWorkspaceDatabase() {
  const name = dbName();
  if (dbPromise) {
    try { (await dbPromise).close(); } catch (_e) {}
    dbPromise = null;
  }
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = resolve;
    request.onblocked = resolve;
  });
}
