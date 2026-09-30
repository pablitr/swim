// SwimCoachDB - Promisified IndexedDB Wrapper
// Provides atomic commits, typed object stores, index queries, and seamless fallback.

export const DB_NAME = 'SwimCoachDB';
export const DB_VERSION = 1;

export const STORES = {
  SWIMMERS: 'swimmers',
  SESSIONS: 'sessions',
  TIMER_STATES: 'timer_states',
  LAPS: 'laps',
  SETTINGS: 'settings'
};

let dbInstance = null;
let customIDBFactory = null;

/**
 * Configure an external IDBFactory (e.g. fake-indexeddb for Node testing)
 */
export function setIndexedDB(factory) {
  customIDBFactory = factory;
  dbInstance = null;
}

/**
 * Get active IDBFactory (custom or global)
 */
export function getIndexedDB() {
  if (customIDBFactory) return customIDBFactory;
  if (typeof globalThis !== 'undefined' && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return null;
}

// In-Memory Storage Emulation for pure Node environments lacking IndexedDB polyfill
class MemoryIDBStore {
  constructor(name, keyPath, indexes = {}) {
    this.name = name;
    this.keyPath = keyPath;
    this.indexes = indexes;
    this.data = new Map();
  }

  get(key) {
    return this.data.get(key) ? structuredClone(this.data.get(key)) : undefined;
  }

  getAll() {
    return Array.from(this.data.values()).map(v => structuredClone(v));
  }

  getAllByIndex(indexName, query) {
    const results = [];
    for (const item of this.data.values()) {
      if (item[indexName] === query) {
        results.push(structuredClone(item));
      }
    }
    return results;
  }

  put(value) {
    const key = value[this.keyPath];
    if (key === undefined || key === null) {
      throw new Error(`Item missing keyPath property "${this.keyPath}"`);
    }
    this.data.set(key, structuredClone(value));
    return key;
  }

  delete(key) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }

  count() {
    return this.data.size;
  }
}

class MemoryDatabase {
  constructor() {
    this.stores = {
      [STORES.SWIMMERS]: new MemoryIDBStore(STORES.SWIMMERS, 'id'),
      [STORES.SESSIONS]: new MemoryIDBStore(STORES.SESSIONS, 'id'),
      [STORES.TIMER_STATES]: new MemoryIDBStore(STORES.TIMER_STATES, 'swimmerId'),
      [STORES.LAPS]: new MemoryIDBStore(STORES.LAPS, 'id', { swimmerId: true, timestamp: true }),
      [STORES.SETTINGS]: new MemoryIDBStore(STORES.SETTINGS, 'key')
    };
  }

  getStore(storeName) {
    const store = this.stores[storeName];
    if (!store) throw new Error(`Object store "${storeName}" not found`);
    return store;
  }
}

let memoryDbInstance = null;

/**
 * Open SwimCoachDB with all required schema definitions
 */
export function openDB(name = DB_NAME, version = DB_VERSION) {
  const idb = getIndexedDB();

  if (!idb) {
    // Pure Node fallback
    if (!memoryDbInstance) {
      memoryDbInstance = new MemoryDatabase();
    }
    return Promise.resolve(memoryDbInstance);
  }

  if (dbInstance && dbInstance.name === name && dbInstance.version === version) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(name, version);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 1. Swimmers store (keyPath: id)
      if (!db.objectStoreNames.contains(STORES.SWIMMERS)) {
        db.createObjectStore(STORES.SWIMMERS, { keyPath: 'id' });
      }

      // 2. Sessions store (keyPath: id)
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
      }

      // 3. Timer states store (keyPath: swimmerId)
      if (!db.objectStoreNames.contains(STORES.TIMER_STATES)) {
        db.createObjectStore(STORES.TIMER_STATES, { keyPath: 'swimmerId' });
      }

      // 4. Laps store (keyPath: id, indexes: swimmerId, timestamp)
      if (!db.objectStoreNames.contains(STORES.LAPS)) {
        const lapsStore = db.createObjectStore(STORES.LAPS, { keyPath: 'id' });
        lapsStore.createIndex('swimmerId', 'swimmerId', { unique: false });
        lapsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 5. Settings store (keyPath: key)
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };

    request.onblocked = () => {
      console.warn('SwimCoachDB open blocked by existing connection');
    };
  });
}

/**
 * Close the current database connection
 */
export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  memoryDbInstance = null;
}

/**
 * Helper to safely execute an immediate atomic transaction
 */
async function executeTransaction(storeName, mode, callback) {
  const db = await openDB();

  // If using memory fallback
  if (db instanceof MemoryDatabase) {
    const store = db.getStore(storeName);
    return callback(store);
  }

  return new Promise((resolve, reject) => {
    let result = undefined;
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    tx.oncomplete = () => {
      resolve(result);
    };

    tx.onerror = () => {
      reject(tx.error || new Error(`Transaction failed on ${storeName}`));
    };

    tx.onabort = () => {
      reject(tx.error || new Error(`Transaction aborted on ${storeName}`));
    };

    try {
      result = callback(store, tx);
      // Immediate atomic commit if supported by the browser
      if (typeof tx.commit === 'function' && mode === 'readwrite') {
        tx.commit();
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Get single item by key
 */
export async function get(storeName, key) {
  const db = await openDB();
  if (db instanceof MemoryDatabase) {
    return db.getStore(storeName).get(key) || null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result !== undefined ? request.result : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from a store
 */
export async function getAll(storeName) {
  const db = await openDB();
  if (db instanceof MemoryDatabase) {
    return db.getStore(storeName).getAll();
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get items using an index
 */
export async function getAllByIndex(storeName, indexName, query) {
  const db = await openDB();
  if (db instanceof MemoryDatabase) {
    return db.getStore(storeName).getAllByIndex(indexName, query);
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(query);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Atomic Put (Insert or Replace)
 */
export async function put(storeName, value) {
  const db = await openDB();
  if (db instanceof MemoryDatabase) {
    return db.getStore(storeName).put(value);
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(value);

    let keyResult = null;
    request.onsuccess = () => {
      keyResult = request.result;
    };

    tx.oncomplete = () => {
      resolve(keyResult);
    };

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    // Immediate atomic commit
    if (typeof tx.commit === 'function') {
      tx.commit();
    }
  });
}

/**
 * Atomic Delete Item by key
 */
export async function deleteItem(storeName, key) {
  const db = await openDB();
  if (db instanceof MemoryDatabase) {
    db.getStore(storeName).delete(key);
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    if (typeof tx.commit === 'function') {
      tx.commit();
    }
  });
}

/**
 * Clear all records in a store
 */
export async function clear(storeName) {
  const db = await openDB();
  if (db instanceof MemoryDatabase) {
    db.getStore(storeName).clear();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    if (typeof tx.commit === 'function') {
      tx.commit();
    }
  });
}

/**
 * Count items in a store
 */
export async function count(storeName) {
  const db = await openDB();
  if (db instanceof MemoryDatabase) {
    return db.getStore(storeName).count();
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
