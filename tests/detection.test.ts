import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent }; },
  Type: { ARRAY: 'ARRAY', OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER' },
}));

// The Gemini key lives server-side; the browser client always targets the /api/gemini proxy.
async function detector() {
  vi.resetModules();
  return (await import('../services/geminiService')).detectAssetsWithBoundingBoxes;
}

beforeEach(() => {
  generateContent.mockReset();
  // Let the real data-URL fallback run without browser image/canvas decoding.
  vi.stubGlobal('Image', class {
    onerror?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
  });
});

const photos = [{ dataUrl: 'data:image/jpeg;base64,dGVzdA==' }];
describe('detection never manufactures inspection evidence', () => {
  it('rejects unreadable and partially readable photo sets', async () => {
    const detect = await detector();
    await expect(detect([{ dataUrl: '' }], [])).rejects.toThrow('could not be read');
    await expect(detect([...photos, { dataUrl: '' }], [])).rejects.toThrow('could not be read');
    expect(generateContent).not.toHaveBeenCalled();
  });
  it('preserves a successful empty detection', async () => {
    const detect = await detector();
    generateContent.mockResolvedValue({ text: '[]' });
    await expect(detect(photos, [])).resolves.toEqual([]);
  });
  it.each(['not json', '{}', '[{"quantity":{}}]'])('rejects malformed response %s', async text => {
    const detect = await detector();
    generateContent.mockResolvedValue({ text });
    await expect(detect(photos, [])).rejects.toThrow(/existing assets are unchanged/i);
  });
  it('propagates API failures and leaves supplied assets unchanged', async () => {
    const detect = await detector();
    generateContent.mockRejectedValue(new Error('quota exceeded'));
    const existing = [{ id: 'real-asset', description: 'Real pump', condition: 'Good' }] as any;
    const before = JSON.stringify(existing);
    await expect(detect(photos, [], false, existing)).rejects.toThrow('asset detection failed');
    expect(JSON.stringify(existing)).toBe(before);
  });
  it('returns validated actual detections', async () => {
    const detect = await detector();
    generateContent.mockResolvedValue({ text: JSON.stringify([{ id: 'pump', category: 'Plumbing', description: 'Observed pump', quantity: 1, cost: 200, rul: 5 }]) });
    const assets = await detect(photos, ['Plumbing']);
    expect(assets).toHaveLength(1);
    // 'pump' isn't an existing asset in this room, so it gets a fresh ID rather than the model's
    expect(assets[0]).toMatchObject({ description: 'Observed pump', verified: false });
    expect(assets[0].id).not.toBe('pump');
  });
});
