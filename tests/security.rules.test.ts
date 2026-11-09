// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes, deleteObject } from 'firebase/storage';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
describe.skipIf(!enabled)('inspection team authorization (Firebase emulators)', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-asset-inspector',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
      storage: { rules: readFileSync('storage.rules', 'utf8') },
    });
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'inspections/site'), { siteInfo: {}, rooms: [], lastUpdated: 'today' });
      await uploadBytes(ref(ctx.storage(), 'inspections/site/photo.jpg'), new Uint8Array([1, 2, 3]));
    });
  });
  afterAll(async () => { await env?.cleanup(); });

  it.each(['public', 'anonymous', 'ordinary-user'])('denies %s inspection reads and forged writes', async kind => {
    const ctx = kind === 'public' ? env.unauthenticatedContext() : env.authenticatedContext(kind);
    const db = ctx.firestore();
    await assertFails(getDoc(doc(db, 'inspections/site')));
    await assertFails(getDocs(collection(db, 'inspections')));
    await assertFails(setDoc(doc(db, 'inspections/site'), { siteInfo: {}, rooms: [], lastUpdated: 'now', assetInspector: true }));
    await assertFails(setDoc(doc(db, 'inspections/new'), { siteInfo: {}, rooms: [], lastUpdated: 'now' }));
    await assertFails(setDoc(doc(db, 'inspections/site/assets/a'), { id: 'a', category: 'HVAC', condition: 'Good' }));
    await assertFails(setDoc(doc(db, 'inspections/site/presence/u'), { userId: 'u', email: 'forged', lastActive: 'now' }));
    await assertFails(deleteDoc(doc(db, 'inspections/site')));
  });
  it('allows the explicitly approved shared inspection team', async () => {
    const db = env.authenticatedContext('approved', { assetInspector: true }).firestore();
    await assertSucceeds(getDocs(collection(db, 'inspections')));
    for (const path of ['inspections/approved', 'inspections/approved/assets/a', 'inspections/approved/presence/u']) {
      await assertSucceeds(setDoc(doc(db, path), { id: 'a' }));
      await assertSucceeds(getDoc(doc(db, path)));
      await assertSucceeds(deleteDoc(doc(db, path)));
    }
    await assertFails(setDoc(doc(db, 'roles/self'), { assetInspector: true }));
  });
  it.each(['public', 'anonymous'])('denies %s photo reads, writes, and deletes', async kind => {
    const ctx = kind === 'public' ? env.unauthenticatedContext() : env.authenticatedContext(kind);
    const photo = ref(ctx.storage(), 'inspections/site/photo.jpg');
    await assertFails(getBytes(photo));
    await assertFails(uploadBytes(photo, new Uint8Array([9])));
    await assertFails(deleteObject(photo));
  });
  it('allows approved inspectors to save and retrieve photo evidence', async () => {
    const storage = env.authenticatedContext('approved', { assetInspector: true }).storage();
    const photo = ref(storage, 'inspections/site/approved.jpg');
    await assertSucceeds(uploadBytes(photo, new Uint8Array([4, 5])));
    await assertSucceeds(getBytes(photo));
    await assertSucceeds(deleteObject(photo));
    await assertFails(uploadBytes(ref(storage, 'outside/photo.jpg'), new Uint8Array([4])));
  });
});
