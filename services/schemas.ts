import { z } from 'zod';
import { Asset } from '../types';

// ==========================================
// 1. Core Domain Schemas (Ubiquitous Language)
// ==========================================

export const BoundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const AuditEntrySchema = z.object({
  timestamp: z.number(),
  actor: z.enum(['AI', 'USER']),
  action: z.string(),
  details: z.string(),
});

export const RiskHistoryEntrySchema = z.object({
  timestamp: z.number(),
  actor: z.enum(['AI', 'USER']),
  previousRisk: z.string().optional(),
  newRisk: z.string(),
});

export const RiskRatingSchema = z.enum(['Low', 'Medium', 'High', 'Extreme']);
export const ConditionSchema = z.enum(['Excellent', 'Good', 'Average', 'Fair', 'Poor']);

export const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  condition: z.string(),
  riskRating: z.string().optional(),
  riskHistory: z.array(RiskHistoryEntrySchema).optional(),
  justification: z.string(),
  quantity: z.union([z.number(), z.string()]),
  cost: z.string(),
  age: z.string().optional(),
  rul: z.string(),
  verified: z.boolean(),
  aiDetected: z.boolean(),
  sourceImageIndex: z.number().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  notes: z.string().optional(),
  auditTrail: z.array(AuditEntrySchema),
});

export const AppImageSchema = z.object({
  id: z.string(),
  dataUrl: z.string(),
  name: z.string(),
  timestamp: z.number(),
});

export const RoomSchema = z.object({
  id: z.string(),
  buildingName: z.string(),
  roomName: z.string(),
  images: z.array(AppImageSchema),
  assets: z.array(AssetSchema),
  croppedImages: z.record(z.string(), z.string()),
  comments: z.string(),
});

export const DocumentInsightSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  dateAdded: z.number(),
  dataUrl: z.string().optional(),
  mimeType: z.string().optional(),
});

export const WallSegmentSchema = z.object({
  id: z.string(),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  type: z.enum(['wall', 'window', 'door']),
});

export const GridAssetPlacementSchema = z.object({
  assetId: z.string(),
  assetName: z.string(),
  category: z.string(),
  x: z.number(),
  y: z.number(),
});

export const ReconstructionDataSchema = z.object({
  gridScale: z.number(),
  walls: z.array(WallSegmentSchema),
  assets: z.array(GridAssetPlacementSchema),
  gridWidth: z.number(),
  gridHeight: z.number(),
  slices: z.array(z.object({
    id: z.string(),
    name: z.string(),
    position: z.number(),
    direction: z.enum(['vertical', 'horizontal']),
  })),
  uploadedLayoutImage: z.string().optional(),
});

export const WorkOrderSchema = z.object({
  id: z.string(),
  ticketNo: z.string(),
  assetId: z.string().optional(),
  assetName: z.string(),
  roomName: z.string(),
  category: z.string(),
  description: z.string(),
  cost: z.number(),
  maintenanceType: z.enum(['Corrective', 'Preventive', 'Emergency']),
  dateOpened: z.string(),
  status: z.enum(['Open', 'Completed', 'In Progress']),
});

export const AsBuiltDrawingSchema = z.object({
  id: z.string(),
  name: z.string(),
  drawingNo: z.string(),
  revision: z.string(),
  discipline: z.enum(['Architectural', 'Electrical', 'Mechanical', 'Plumbing', 'Fire Services', 'Structural']),
  areaFloor: z.string(),
  summary: z.string(),
  dateAdded: z.number(),
  dataUrl: z.string().optional(),
  detectedEquipment: z.array(z.string()).optional(),
});

export const CogneeNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['Asset', 'Room', 'System', 'WorkOrder', 'Inspector', 'Concept', 'Site', 'Document']),
  description: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const CogneeEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

export const CogneeGraphStateSchema = z.object({
  nodes: z.array(CogneeNodeSchema),
  edges: z.array(CogneeEdgeSchema),
});

// ==========================================
// 2. AI Raw Response Schemas & Sanitizers
// ==========================================

export const RawDetectedAssetSchema = z.object({
  id: z.string().optional(),
  category: z.string().default('General Building'),
  description: z.string().default('Asset detected'),
  // Evidence fields have no defaults: a value the model didn't give stays blank for the
  // inspector to fill rather than being invented (see AGENTS.md "Never Fabricate Register Data").
  condition: z.string().optional(),
  riskRating: z.string().optional(),
  justification: z.string().default('Inspected via AI vision'),
  quantity: z.union([z.string(), z.number()]).default('1'),
  cost: z.union([z.string(), z.number()]).optional(),
  age: z.union([z.string(), z.number()]).optional(),
  rul: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().default(''),
  sourceImageIndex: z.number().optional(),
  appearsInImageIndices: z.array(z.number()).optional(),
  boundingBox: z.object({
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().default(1),
    height: z.number().default(1),
  }).optional(),
});

export const RawDetectedAssetArraySchema = z.array(RawDetectedAssetSchema);

/**
 * Robust JSON parser that handles codeblocks (```json ... ```), raw objects, and fallbacks.
 */
export function safeParseJson<T>(rawText: string | undefined | null, fallback: T): T {
  if (!rawText || typeof rawText !== 'string') return fallback;
  try {
    let clean = rawText.trim();
    // Remove markdown codeblock wrapping if present
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean) as T;
  } catch (err) {
    console.warn('[SafeJSONParse] Failed to parse JSON payload, returning fallback', err, rawText);
    return fallback;
  }
}

/**
 * Sanitizes and validates detected assets against strict domain bounds.
 *
 * A model-supplied `id` is kept only when it matches one of `existingAssetIds` (a re-inspection
 * of a known asset), and only once per batch. Any other id gets a fresh UUID, so the model can
 * never mint an ID that collides with an asset elsewhere in the register.
 */
export function sanitizeDetectedAssets(rawJson: unknown, existingAssetIds: ReadonlySet<string> = new Set()): Asset[] {
  const claimedIds = new Set<string>();
  // Validate item-by-item so one malformed detection doesn't discard the whole batch
  const items = (Array.isArray(rawJson) ? rawJson : []).flatMap((raw) => {
    const parsed = RawDetectedAssetSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });

  return items.map((a) => {
    // Clamp bounding box dimensions between 0 and 1
    const bbox = a.boundingBox
      ? {
          x: Math.max(0, Math.min(1, a.boundingBox.x || 0)),
          y: Math.max(0, Math.min(1, a.boundingBox.y || 0)),
          width: Math.max(0.01, Math.min(1, a.boundingBox.width || 1)),
          height: Math.max(0.01, Math.min(1, a.boundingBox.height || 1)),
        }
      : undefined;

    const desc = a.description || 'No description provided.';
    const candidateId = a.id?.trim() || '';
    const isKnownAsset = existingAssetIds.has(candidateId) && !claimedIds.has(candidateId);
    const id = isKnownAsset ? candidateId : crypto.randomUUID();
    claimedIds.add(id);

    const missingEvidence = (['condition', 'riskRating', 'cost', 'age', 'rul'] as const)
      .filter((field) => a[field] === undefined || a[field] === null || String(a[field]).trim() === '');
    const asText = (value: string | number | undefined) => (value === undefined || value === null ? '' : String(value));

    return {
      id,
      name: `${a.category} - ${desc.substring(0, 30)}...`,
      category: a.category,
      description: desc,
      condition: a.condition || '',
      riskRating: a.riskRating || '',
      justification: a.justification || 'Visual inspection recorded.',
      quantity: String(a.quantity ?? '1'),
      cost: asText(a.cost),
      age: asText(a.age),
      rul: asText(a.rul),
      notes: a.notes || '',
      verified: false,
      aiDetected: true,
      sourceImageIndex: a.sourceImageIndex,
      boundingBox: bbox,
      auditTrail: [
        {
          timestamp: Date.now(),
          actor: 'AI' as const,
          action: 'CREATED',
          details: missingEvidence.length > 0
            ? `Detected via Gemini Vision. AI gave no value for: ${missingEvidence.join(', ')} — needs inspector review.`
            : 'Detected and validated via Gemini Vision with strict schema.',
        },
      ],
    };
  });
}
