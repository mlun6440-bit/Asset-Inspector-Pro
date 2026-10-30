import { describe, expect, it } from 'vitest';
import { ASSET_EXPORT_HEADERS, assetExportRow, csvCell, reviewStatus } from '../services/assetExport';

const base = { id: 'asset-123', category: 'Plumbing Systems,Pump', description: 'Pump, "duty"', condition: 'Poor', riskRating: 'High',
  justification: 'Corroded', quantity: 2, cost: '1500', age: '12', rul: '1', notes: '', auditTrail: [] } as any;

describe('register export', () => {
  it('flags unreviewed AI findings and keeps the original asset ID', () => {
    const row = assetExportRow({ ...base, aiDetected: true, verified: false }, false);
    expect(row).toHaveLength(ASSET_EXPORT_HEADERS.length);
    expect(row[0]).toBe('asset-123');
    expect(row[ASSET_EXPORT_HEADERS.indexOf('Source')]).toBe('AI-detected');
    expect(row[ASSET_EXPORT_HEADERS.indexOf('Review Status')]).toBe('AI – needs review');
  });
  it('distinguishes verified and manual records', () => {
    expect(reviewStatus({ aiDetected: true, verified: true })).toBe('Verified');
    expect(reviewStatus({ aiDetected: false, verified: false })).toBe('Manual – unverified');
  });
  it('leaves missing values blank instead of defaulting them', () => {
    const row = assetExportRow({ ...base, riskRating: undefined, rul: '', cost: '', aiDetected: true, verified: false }, true);
    expect(row[ASSET_EXPORT_HEADERS.indexOf('Risk')]).toBe('');
    expect(row[ASSET_EXPORT_HEADERS.indexOf('RUL (yrs)')]).toBe('');
    expect(row[ASSET_EXPORT_HEADERS.indexOf('Qty')]).toBe('N/A'); // building fabric has no quantity
  });
  it('escapes commas and quotes in CSV cells', () => {
    expect(csvCell('Pump, "duty"')).toBe('"Pump, ""duty"""');
  });
});
