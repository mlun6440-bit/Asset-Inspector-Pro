import { describe, expect, it } from 'vitest';
import { sanitizeDetectedAssets } from '../services/schemas';
import { removeRoomImage } from '../services/roomImages';

const detection = (id: string, description = 'Observed item') => ({ id, category: 'Plumbing', description });

describe('detected asset IDs never collide with or replace register IDs', () => {
  it('keeps a model-supplied id only when it matches an existing asset in this room', () => {
    const [known, unknown] = sanitizeDetectedAssets([detection('pump-1'), detection('asset-from-another-room')], new Set(['pump-1']));
    expect(known.id).toBe('pump-1');
    expect(unknown.id).not.toBe('asset-from-another-room');
    expect(unknown.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('gives a fresh id when the model reuses the same existing id twice in one batch', () => {
    const assets = sanitizeDetectedAssets([detection('pump-1'), detection('pump-1', 'Second pump')], new Set(['pump-1']));
    expect(assets[0].id).toBe('pump-1');
    expect(assets[1].id).not.toBe('pump-1');
  });
  it('marks every AI detection unverified for human review', () => {
    const assets = sanitizeDetectedAssets([detection('x')]);
    expect(assets[0]).toMatchObject({ verified: false, aiDetected: true });
  });
});

describe('removing a room photo keeps assets pointing at their own photo', () => {
  const room = {
    id: 'room-1', roomName: 'Plant', images: [{ id: 'a', dataUrl: '' }, { id: 'b', dataUrl: '' }, { id: 'c', dataUrl: '' }],
    assets: [
      { id: 'on-a', sourceImageIndex: 0 },
      { id: 'on-b', sourceImageIndex: 1 },
      { id: 'on-c', sourceImageIndex: 2 },
      { id: 'manual' },
    ],
  } as any;

  it('re-indexes later photos, drops references to the deleted photo, and keeps IDs', () => {
    const before = JSON.stringify(room);
    const result = removeRoomImage(room, 'b');
    expect(result.images.map(i => i.id)).toEqual(['a', 'c']);
    expect(result.assets.map(a => [a.id, a.sourceImageIndex])).toEqual([
      ['on-a', 0], ['on-b', undefined], ['on-c', 1], ['manual', undefined],
    ]);
    expect(JSON.stringify(room)).toBe(before); // input not mutated
  });
  it('is a no-op for an unknown photo id', () => {
    expect(removeRoomImage(room, 'zzz')).toEqual({ images: room.images, assets: room.assets });
  });
});
