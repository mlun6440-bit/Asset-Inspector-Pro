import { Room, SiteInfo } from '../types';

const DB_NAME = 'AssetInspectorDB';
const DB_VERSION = 1;

export class StorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is unavailable in this environment');
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('rooms')) {
          db.createObjectStore('rooms', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  async saveState(siteInfo: SiteInfo, rooms: Room[]): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['rooms', 'settings'], 'readwrite');

      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      transaction.oncomplete = () => resolve();

      const settingsStore = transaction.objectStore('settings');
      settingsStore.put({ key: 'siteInfo', value: siteInfo });

      const roomsStore = transaction.objectStore('rooms');
      // Clear old rooms to ensure sync
      roomsStore.clear();
      (rooms || []).forEach(room => roomsStore.put(room));
    });
  }

  async loadState(): Promise<{ siteInfo: SiteInfo | null, rooms: Room[] }> {
    await this.init();
    if (!this.db) return { siteInfo: null, rooms: [] };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['rooms', 'settings'], 'readonly');
      const rooms: Room[] = [];
      let siteInfo: SiteInfo | null = null;

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve({ siteInfo, rooms });

      const settingsStore = transaction.objectStore('settings');
      const infoReq = settingsStore.get('siteInfo');
      infoReq.onsuccess = () => {
        if (infoReq.result) siteInfo = infoReq.result.value;
      };

      const roomsStore = transaction.objectStore('rooms');
      const roomsReq = roomsStore.openCursor();
      roomsReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          rooms.push(cursor.value);
          cursor.continue();
        }
      };
    });
  }

  async clearData(): Promise<void> {
    await this.init();
    if (!this.db) return;
    const tx = this.db.transaction(['rooms', 'settings'], 'readwrite');
    tx.objectStore('rooms').clear();
    tx.objectStore('settings').clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Clear transaction aborted'));
    });
  }

  async deleteDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initPromise = null;
    if (typeof indexedDB === 'undefined') return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn("Database deletion blocked. Closing open connections.");
        resolve();
      };
    });
  }
}

export const storageService = new StorageService();