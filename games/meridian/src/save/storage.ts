// Key-value storage backends. IndexedDB in the browser (survives reloads and works offline);
// an in-memory fallback when IndexedDB is unavailable (private mode, tests).

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, unknown>();
  async get<T>(key: string) {
    const v = this.map.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async set<T>(key: string, value: T) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async keys() {
    return [...this.map.keys()];
  }
}

export class IndexedDbStore implements KeyValueStore {
  private dbPromise: Promise<IDBDatabase>;

  constructor(name = "meridian", private storeName = "kv") {
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.dbPromise;
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(this.storeName, mode);
      const req = fn(t.objectStore(this.storeName));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }

  get<T>(key: string) {
    return this.tx<T | undefined>("readonly", (s) => s.get(key));
  }
  async set<T>(key: string, value: T) {
    await this.tx("readwrite", (s) => s.put(value, key));
  }
  async delete(key: string) {
    await this.tx("readwrite", (s) => s.delete(key));
  }
  async keys() {
    return (await this.tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())).map(String);
  }
}

/** Picks IndexedDB when it works, otherwise memory (and says so, so the UI can warn). */
export async function openStore(): Promise<{ store: KeyValueStore; persistent: boolean }> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
    const store = new IndexedDbStore();
    await store.keys();
    return { store, persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}
