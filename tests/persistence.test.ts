import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  memory: new Map<string, any>(),
  setDoc: vi.fn(), commit: vi.fn(), getDoc: vi.fn(),
}));
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => {
  const user = { getIdToken: async () => "test-token" };
  return {
    getAuth: () => ({}),
    signInAnonymously: async () => ({ user }),
    onAuthStateChanged: (_auth: unknown, callback: (u: unknown) => void) => { callback(user); return () => {}; },
  };
});
vi.mock('firebase/storage', () => ({ getStorage: () => ({}), ref: vi.fn(), uploadString: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), doc: (...args: any[]) => args,
  setDoc: mocks.setDoc, getDoc: mocks.getDoc,
  writeBatch: () => ({ set: vi.fn(), commit: mocks.commit }),
  collection: vi.fn(), getDocs: vi.fn(), onSnapshot: vi.fn(), deleteDoc: vi.fn(),
}));
vi.mock('idb-keyval', () => ({
  get: async (key: string) => structuredClone(mocks.memory.get(key)),
  set: async (key: string, value: any) => { mocks.memory.set(key, structuredClone(value)); },
  clear: vi.fn(), del: vi.fn(),
}));
import { FirebaseService } from '../services/firebaseService';
const site = { name: 'Test Site', address: '', numRooms: 1 } as any;
const rooms = [{ id: 'room', roomName: 'Plant', assets: [{ id: 'pump', category: 'Plumbing', condition: 'Good' }], images: [], croppedImages: {} }] as any;

beforeEach(() => {
  mocks.memory.clear();
  mocks.setDoc.mockReset().mockResolvedValue(undefined);
  mocks.commit.mockReset().mockResolvedValue(undefined);
  mocks.getDoc.mockReset();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('cloud sync failure retention', () => {
  it('queues a failed inspection write and preserves the local draft', async () => {
    mocks.setDoc.mockRejectedValue(new Error('permission-denied'));
    await new FirebaseService().saveState(site, rooms);
    expect(mocks.memory.get('pending_sync_queue').test_site.rooms).toEqual(rooms);
    expect(mocks.memory.get('rooms')).toEqual(rooms);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('queues a failed asset batch even if the inspection write succeeds', async () => {
    mocks.commit.mockRejectedValue(new Error('unavailable'));
    await new FirebaseService().saveState(site, rooms);
    expect(mocks.memory.get('pending_sync_queue').test_site.lastError).toBe('unavailable');
  });
  it('retains failed retries and counts/deletes only successfully saved inspections', async () => {
    const service = new FirebaseService();
    mocks.memory.set('pending_sync_queue', { test_site: { siteInfo: site, rooms } });
    mocks.commit.mockRejectedValueOnce(new Error('unavailable'));
    expect(await service.syncPendingQueue()).toBe(0);
    expect(mocks.memory.get('pending_sync_queue').test_site.retryCount).toBe(1);
    expect(await service.syncPendingQueue()).toBe(1);
    expect(mocks.memory.get('pending_sync_queue')).toEqual({});
  });
  it('does not overwrite pending local edits with stale cloud data on reload', async () => {
    mocks.memory.set('siteInfo', site);
    mocks.memory.set('rooms', rooms);
    mocks.memory.set('pending_sync_queue', { test_site: { siteInfo: site, rooms } });
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ siteInfo: site, rooms: [] }) });
    expect((await new FirebaseService().loadState()).rooms).toEqual(rooms);
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });
});
