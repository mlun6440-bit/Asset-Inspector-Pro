import { describe, expect, it, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent }; },
  Type: { ARRAY: 'ARRAY', OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER' },
}));
import { analyzeCFOFinance } from '../services/geminiService';

const asset = (id: string, cost: string, rul: string, riskRating = 'Low') =>
  ({ id, name: id, category: 'HVAC & Refrigeration,Split AC', roomName: 'Plant', condition: 'Poor', cost, rul, riskRating });

describe('offline CAPEX fallback uses only recorded values', () => {
  it('buckets by recorded remaining life without inventing values', async () => {
    generateContent.mockRejectedValue(new Error('offline'));
    const result = await analyzeCFOFinance([
      asset('end-of-life', '1000', '0', 'Extreme'),
      asset('short', '200', '4'),
      asset('medium', '300', '8'),
      asset('long', '400', '15'),
      asset('unknown', '500', ''),
    ], [], []);
    expect(result.immediateCAPEX).toBe(1000);   // RUL 0 is immediate, not "5 years"
    expect(result.shortTermCAPEX).toBe(200);
    expect(result.mediumTermCAPEX).toBe(300);   // RUL 15 is not medium-term
    expect(result.totalAssetValue).toBe(2400);
    expect(result.scenarios).toEqual([]);       // no fabricated multi-year forecast
    expect(result.criticalAssets[0].assetId).toBe('end-of-life'); // ranked by risk-weighted cost
  });
});
