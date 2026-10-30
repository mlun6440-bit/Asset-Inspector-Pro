import { Asset } from '../types';

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
