import { Asset, Room } from '../types';

/**
 * Review status shown in every export. AI findings stay "Needs review" until an inspector
 * verifies them, so a register never presents unreviewed AI output as confirmed evidence.
 */
export function reviewStatus(asset: Pick<Asset, 'aiDetected' | 'verified'>): string {
  if (asset.verified) return 'Verified';
  return asset.aiDetected ? 'AI – needs review' : 'Manual – unverified';
}

export const ASSET_EXPORT_HEADERS = [
  'Asset ID', 'Category', 'Description', 'Condition', 'Risk', 'Age (yrs)', 'Justification', 'Notes',
  'Qty', 'Cost ($)', 'RUL (yrs)', 'Source', 'Review Status',
];

/** One export row per asset. Blank values stay blank — nothing is defaulted on export. */
export function assetExportRow(asset: Asset, isBuildingFabric: boolean): (string | number)[] {
  return [
    asset.id,
    asset.category,
    asset.description,
    asset.condition || '',
    asset.riskRating || '',
    asset.age || '',
    asset.justification || '',
    asset.notes || '',
    isBuildingFabric ? 'N/A' : asset.quantity,
    asset.cost || '',
    asset.rul || '',
    asset.aiDetected ? 'AI-detected' : 'Manual',
    reviewStatus(asset),
  ];
}

/** RFC 4180 CSV cell: quote and double any embedded quotes. */
export function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** Excel sheet names: max 31 chars, no []*?/\: and unique within the workbook (case-insensitive). */
export function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw || 'Room').replace(/[\[\]\*\?\/\\\:]/g, '').trim().substring(0, 31) || 'Room';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    name = base.substring(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

export interface WorkbookSheet {
  sheet: string;
  data: (string | number | null)[][];
}

/**
 * One sheet per room that has assets (with room metadata above the asset table), plus a
 * "Site Notes" sheet. Duplicate room names get distinct sheet names instead of failing.
 */
export function buildWorkbookSheets(
  siteInfo: { name: string; address?: string; notes?: string },
  rooms: Room[],
  isBuildingFabric: (category: string) => boolean,
): WorkbookSheet[] {
  const used = new Set<string>(['site notes']);
  const sheets: WorkbookSheet[] = rooms.filter(room => room.assets.length > 0).map(room => ({
    sheet: uniqueSheetName(room.roomName, used),
    data: [
      ['Room ID', room.id, 'Level', room.floorLevel || '', 'Room Code', room.roomCode || '', 'Room Type', room.roomType || ''],
      [],
      [...ASSET_EXPORT_HEADERS, 'Last Action'],
      ...room.assets.map(a => {
        const lastLog = a.auditTrail && a.auditTrail.length > 0 ? a.auditTrail[a.auditTrail.length - 1] : null;
        const lastAction = lastLog ? `${lastLog.action} (${lastLog.actor})` : 'N/A';
        return [...assetExportRow(a, isBuildingFabric(a.category)), lastAction];
      }),
    ],
  }));
  sheets.push({
    sheet: 'Site Notes',
    data: [
      ['Site Name', siteInfo.name],
      ['Address', siteInfo.address || ''],
      ['Site Notes / Executive Summary', siteInfo.notes || ''],
    ],
  });
  return sheets;
}
