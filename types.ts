
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
}

export interface SiteInfo {
  name: string;
  address: string;
  numRooms: number;
  notes?: string;
  documents?: DocumentInsight[];
  latitude?: number;
  longitude?: number;
}

export interface AppState {
  siteInfo: SiteInfo;
  rooms: Room[];
  currentRoomIndex: number;
  view: 'welcome' | 'assessment' | 'summary';
  privacyMode: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}
