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

import { buildWorkbookSheets, uniqueSheetName } from '../services/assetExport';

describe('Excel workbook', () => {
  it('gives duplicate or invalid room names distinct, valid sheet names', () => {
    const used = new Set<string>();
    expect(uniqueSheetName('Office', used)).toBe('Office');
    expect(uniqueSheetName('office', used)).toBe('office (2)');
    expect(uniqueSheetName('Plant/Room: [A]', used)).toBe('PlantRoom A');
    expect(uniqueSheetName('x'.repeat(40), used)).toHaveLength(31);
  });
  it('writes one sheet per room with assets, with room metadata and the original IDs', () => {
    const rooms = [
      { id: 'room-a', roomName: 'Office', floorLevel: 'L1', roomCode: 'C-1', roomType: 'Office', assets: [{ ...base, aiDetected: true, verified: false }] },
      { id: 'room-b', roomName: 'Office', assets: [{ ...base, id: 'asset-2', aiDetected: false, verified: true }] },
      { id: 'room-c', roomName: 'Empty', assets: [] },
    ] as any;
    const sheets = buildWorkbookSheets({ name: 'Synthetic Site' }, rooms, () => false);
    expect(sheets.map(s => s.sheet)).toEqual(['Office', 'Office (2)', 'Site Notes']);
    expect(sheets[0].data[0]).toEqual(['Room ID', 'room-a', 'Level', 'L1', 'Room Code', 'C-1', 'Room Type', 'Office']);
    expect(sheets[0].data[3][0]).toBe('asset-123');
    expect(sheets[1].data[3][0]).toBe('asset-2');
  });
});
