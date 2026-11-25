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
  condition: z.string().default('Average'),
  riskRating: z.string().default('Low'),
  justification: z.string().default('Inspected via AI vision'),
  quantity: z.union([z.string(), z.number()]).default('1'),
  cost: z.union([z.string(), z.number()]).default(0),
  age: z.union([z.string(), z.number()]).default(0),
  rul: z.union([z.string(), z.number()]).default(10),
  notes: z.string().optional().default(''),
  sourceImageIndex: z.number().optional().default(0),
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
  const trimmed = rawText.trim();
  if (!trimmed) return fallback;

  // 1. Direct parse attempt
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue to extraction strategies
  }

  // 2. Extract fenced ```json ... ``` or ``` ... ``` block anywhere in response
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim()) as T;
    } catch {
      // continue to bracket extraction
    }
  }

  // 3. Extract outermost JSON object or array
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const startIdx =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
      ? firstBrace
      : Math.min(firstBrace, firstBracket);

  if (startIdx !== -1) {
    const endChar = trimmed[startIdx] === '[' ? ']' : '}';
    const endIdx = trimmed.lastIndexOf(endChar);
    if (endIdx > startIdx) {
      try {
        return JSON.parse(trimmed.slice(startIdx, endIdx + 1)) as T;
      } catch {
        // fall through to fallback
      }
    }
  }

  console.warn('[SafeJSONParse] Failed to parse JSON payload, returning fallback');
  return fallback;
}

/**
 * Sanitizes and validates detected assets against strict domain bounds
 */
export function sanitizeDetectedAssets(rawJson: unknown): Asset[] {
  const parsed = RawDetectedAssetArraySchema.safeParse(rawJson);
  const items = parsed.success ? parsed.data : [];

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
    const id = a.id && a.id.trim().length > 0 ? a.id : crypto.randomUUID();

    return {
      id,
      name: `${a.category} - ${desc.substring(0, 30)}...`,
      category: a.category,
      description: desc,
      condition: a.condition || 'Average',
      riskRating: a.riskRating || 'Low',
      justification: a.justification || 'Visual inspection recorded.',
      quantity: String(a.quantity ?? '1'),
      cost: String(a.cost ?? '0'),
      age: String(a.age ?? '0'),
      rul: String(a.rul ?? '10'),
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
          details: 'Detected and validated via Gemini Vision with strict schema.',
        },
      ],
    };
  });
}

// ==========================================
// Video Walk Extractor Schemas
// ==========================================

export const VideoWalkSiteZoneSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  name: z.string().min(1),
  startTimestamp: z.number().nonnegative(),
  endTimestamp: z.number().nonnegative(),
  startFormatted: z.string().default('00:00'),
  endFormatted: z.string().default('00:00'),
  summary: z.string().default(''),
  roomType: z.string().optional(),
});

export const VideoWalkExtractedAssetSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  name: z.string().min(1),
  category: z.string().default('General Building Fabric'),
  zoneName: z.string().default('General Zone'),
  timestampSeconds: z.number().nonnegative().default(0),
  timestampFormatted: z.string().default('00:00'),
  condition: z.enum(['Excellent', 'Good', 'Average', 'Fair', 'Poor']).default('Good'),
  riskRating: z.enum(['Low', 'Medium', 'High', 'Extreme']).default('Low'),
  justification: z.string().default('Visual assessment recorded during video site walk.'),
  ageYears: z.string().default('5'),
  rulYears: z.string().default('10'),
  physicalLocation: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.92),
  snapshotDataUrl: z.string().optional(),
  boundingBox: BoundingBoxSchema.optional(),
});

export const RawVideoWalkPayloadSchema = z.object({
  zones: z.array(z.any()).default([]),
  assets: z.array(z.any()).default([]),
});

export function sanitizeVideoWalkResults(rawJson: unknown): {
  zones: z.infer<typeof VideoWalkSiteZoneSchema>[];
  assets: z.infer<typeof VideoWalkExtractedAssetSchema>[];
} {
  const parsed = RawVideoWalkPayloadSchema.safeParse(rawJson);
  if (!parsed.success) {
    return { zones: [], assets: [] };
  }

  const zones = (parsed.data.zones || []).map((zItem, index) => {
    const startSec = Math.max(0, Number(zItem.startTimestamp ?? (index * 60)));
    const endSec = Math.max(startSec + 10, Number(zItem.endTimestamp ?? ((index + 1) * 60)));
    const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return {
      id: zItem.id || `zone-${index + 1}`,
      name: zItem.name || `Facility Zone ${index + 1}`,
      startTimestamp: startSec,
      endTimestamp: endSec,
      startFormatted: zItem.startFormatted || formatTime(startSec),
      endFormatted: zItem.endFormatted || formatTime(endSec),
      summary: zItem.summary || 'Surveyed area during video walkthrough.',
      roomType: zItem.roomType || 'Facility Room',
    };
  });

  const assets = (parsed.data.assets || []).map((aItem, index) => {
    const sec = Math.max(0, Number(aItem.timestampSeconds ?? 0));
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const formatted = aItem.timestampFormatted || `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const bbox = aItem.boundingBox
      ? {
          x: Math.max(0, Math.min(1, Number(aItem.boundingBox.x) || 0)),
          y: Math.max(0, Math.min(1, Number(aItem.boundingBox.y) || 0)),
          width: Math.max(0.02, Math.min(1, Number(aItem.boundingBox.width) || 0.5)),
          height: Math.max(0.02, Math.min(1, Number(aItem.boundingBox.height) || 0.5)),
        }
      : undefined;

    const condition = ['Excellent', 'Good', 'Average', 'Fair', 'Poor'].includes(aItem.condition)
      ? aItem.condition
      : 'Good';

    const riskRating = ['Low', 'Medium', 'High', 'Extreme'].includes(aItem.riskRating)
      ? aItem.riskRating
      : 'Low';

    return {
      id: aItem.id || `video-asset-${index + 1}`,
      name: aItem.name || `${aItem.category || 'Asset'} - Unit #${index + 1}`,
      category: aItem.category || 'Building Structural & Fabric,Walls',
      zoneName: aItem.zoneName || (zones[0]?.name ?? 'General Facility'),
      timestampSeconds: sec,
      timestampFormatted: formatted,
      condition,
      riskRating,
      justification: aItem.justification || 'Detected during automated video walkthrough inspection.',
      ageYears: String(aItem.ageYears ?? aItem.age ?? '5'),
      rulYears: String(aItem.rulYears ?? aItem.rul ?? '15'),
      physicalLocation: aItem.physicalLocation || 'Visible on video walk path',
      confidence: Math.max(0.5, Math.min(1, Number(aItem.confidence) || 0.92)),
      snapshotDataUrl: aItem.snapshotDataUrl,
      boundingBox: bbox,
    };
  });

  return { zones, assets };
}
