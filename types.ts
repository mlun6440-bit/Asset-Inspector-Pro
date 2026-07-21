
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AuditEntry {
  timestamp: number;
  actor: 'AI' | 'USER';
  action: string;
  details: string;
}

export interface RiskHistoryEntry {
  timestamp: number;
  actor: 'AI' | 'USER';
  previousRisk?: string;
  newRisk: string;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  description: string;
  condition: string;
  riskRating?: string; // Low, Medium, High, Extreme
  riskHistory?: RiskHistoryEntry[];
  justification: string;
  quantity: number | string;
  cost: string;
  age?: string; // New field: Estimated Age in years
  rul: string;
  verified: boolean;
  aiDetected: boolean;
  sourceImageIndex?: number;
  boundingBox?: BoundingBox;
  notes?: string;
  auditTrail: AuditEntry[];
}

export interface AppImage {
  id: string;
  dataUrl: string;
  name: string;
  timestamp: number;
}

export interface Room {
  id: string;
  buildingName: string;
  roomName: string;
  images: AppImage[];
  assets: Asset[];
  croppedImages: Record<string, string>;
  comments: string;
}

export interface DocumentInsight {
  id: string;
  name: string;
  summary: string;
  dateAdded: number;
  dataUrl?: string;
  mimeType?: string;
}

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'wall' | 'window' | 'door';
}

export interface GridAssetPlacement {
  assetId: string;
  assetName: string;
  category: string;
  x: number;
  y: number;
}

export interface ReconstructionData {
  gridScale: number; // scale in pixels per meter
  walls: WallSegment[];
  assets: GridAssetPlacement[];
  gridWidth: number;
  gridHeight: number;
  slices: { id: string; name: string; position: number; direction: 'vertical' | 'horizontal' }[];
  uploadedLayoutImage?: string; // base64
}

export interface SiteInfo {
  name: string;
  address: string;
  numRooms: number;
  notes?: string;
  documents?: DocumentInsight[];
  latitude?: number;
  longitude?: number;
  reconstructionData?: ReconstructionData;
  agentOS?: AgentOSState;
}

export interface AppState {
  siteInfo: SiteInfo;
  rooms: Room[];
  currentRoomIndex: number;
  view: 'welcome' | 'assessment' | 'summary' | 'reconstruction' | 'ai-agent-os';
  privacyMode: boolean;
}

export interface AgentMemoryItem {
  id: string;
  category: 'observation' | 'guideline' | 'site_fact' | 'rule';
  text: string;
  timestamp: number;
}

export interface AsBuiltDrawing {
  id: string;
  name: string;
  drawingNo: string;
  revision: string;
  discipline: 'Architectural' | 'Electrical' | 'Mechanical' | 'Plumbing' | 'Fire Services' | 'Structural';
  areaFloor: string;
  summary: string;
  dateAdded: number;
  dataUrl?: string;
  detectedEquipment?: string[];
}

export interface HistoricalVisionCapture {
  id: string;
  assetId: string;
  assetName: string;
  dateCaptured: string;
  condition: string;
  notes: string;
  dataUrl: string;
}

export interface WorkOrder {
  id: string;
  ticketNo: string;
  assetId?: string; // matched asset
  assetName: string; // manual description/fallback
  roomName: string;
  category: string;
  description: string;
  cost: number;
  maintenanceType: 'Corrective' | 'Preventive' | 'Emergency';
  dateOpened: string;
  status: 'Open' | 'Completed' | 'In Progress';
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  category: 'compliance' | 'finance' | 'vision' | 'risk' | 'predictive';
  enabled: boolean;
}

export interface CogneeNode {
  id: string;
  label: string;
  type: 'Asset' | 'Room' | 'System' | 'WorkOrder' | 'Inspector' | 'Concept' | 'Site' | 'Document';
  description?: string;
  properties?: Record<string, any>;
  x?: number;
  y?: number;
}

export interface CogneeEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  description?: string;
}

export interface CogneeGraphState {
  nodes: CogneeNode[];
  edges: CogneeEdge[];
}

export interface AgentOSState {
  enabled: boolean;
  skills: AgentSkill[];
  memories: AgentMemoryItem[];
  customRules: string[];
  asBuiltDrawings?: AsBuiltDrawing[];
  historicalVisionCaptures?: HistoricalVisionCapture[];
  workOrders?: WorkOrder[];
  cogneeGraph?: CogneeGraphState;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}
