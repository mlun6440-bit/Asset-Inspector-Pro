import { Room, SiteInfo } from '../types';

const DB_NAME = 'AssetInspectorDB';
const DB_VERSION = 1;

export class StorageService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
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
  }

  async saveState(siteInfo: SiteInfo, rooms: Room[]): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['rooms', 'settings'], 'readwrite');
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      const settingsStore = transaction.objectStore('settings');
      settingsStore.put({ key: 'siteInfo', value: siteInfo });

      const roomsStore = transaction.objectStore('rooms');
      // Clear old rooms to ensure sync
      roomsStore.clear(); 
      rooms.forEach(room => roomsStore.put(room));
    });
  }

  async loadState(): Promise<{ siteInfo: SiteInfo | null, rooms: Room[] }> {
    if (!this.db) await this.init();

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
    if (!this.db) await this.init();
    const tx = this.db!.transaction(['rooms', 'settings'], 'readwrite');
    tx.objectStore('rooms').clear();
    tx.objectStore('settings').clear();
    return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
    });
  }

  async deleteDatabase(): Promise<void> {
    if (this.db) {
        this.db.close();
        this.db = null;
    }
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