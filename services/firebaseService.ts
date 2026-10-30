
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, writeBatch, getDocs, onSnapshot, deleteDoc } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { get, set, clear, del } from 'idb-keyval';
import { Room, SiteInfo } from '../types';
import appletConfig from "../firebase-applet-config.json";

// ==============================================================
// FIREBASE CONFIGURATION (Connected to 'building-asset-capture')
// ==============================================================
const firebaseConfig = {
  apiKey: appletConfig.apiKey || "AIzaSyALGJMHG6fYH6ZztUEtLfjTE_reU1C8yXU",
  authDomain: appletConfig.authDomain || "building-asset-capture.firebaseapp.com",
  projectId: appletConfig.projectId || "building-asset-capture",
  storageBucket: appletConfig.storageBucket || "building-asset-capture.firebasestorage.app",
  messagingSenderId: appletConfig.messagingSenderId || "626380950826", 
  appId: appletConfig.appId || "1:626380950826:web:1cf13f91456df047596253" 
};

// Initialize Firebase
let db: any;
let storage: any;
let auth: any;
let isConfigured = false;

// Resolves once Firebase Auth has a signed-in user (or sign-in has definitely failed).
// The security rules require request.auth, so every cloud read/write awaits this first.
let resolveAuthReady: () => void = () => {};
const authReady: Promise<void> = new Promise(resolve => { resolveAuthReady = resolve; });

// Strict Firestore Error standard from system skill instructions
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map((p: any) => ({
        providerId: p.providerId,
        email: p.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed Info:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

try {
    const app = initializeApp(firebaseConfig);
    const dbId = appletConfig.firestoreDatabaseId;
    db = dbId ? getFirestore(app, dbId) : getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);
    isConfigured = true;
    console.log("✅ Firebase Initialized: DB + Storage + Auth Ready with Database ID:", dbId || "default");

    // Optional/Best-effort anonymous authentication to ensure valid credentials inside Firestore/Storage environments
    onAuthStateChanged(auth, (user: any) => { if (user) resolveAuthReady(); });
    signInAnonymously(auth)
        .then(() => console.log("🔐 Authenticated anonymously to Firebase"))
        .catch(e => {
            console.warn("⚠️ Anonymous sign-in failed — cloud sync will be refused by security rules. Enable Anonymous sign-in in the Firebase console.", e.message);
            resolveAuthReady(); // unblock callers; their requests will fail and fall back to local storage
        });
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

// Seeded preloaded inspections representing experimental properties in Sri Lanka and Australia
const SEEDED_INSPECTIONS: any[] = [
  {
    id: "colombo_port_warehouse_b",
    siteInfo: {
      name: "Colombo Port Warehouse B",
      address: "Berth 5, Colombo Port, Sri Lanka",
      numRooms: 2,
      notes: "Heavy industrial shipment facility. Salt air hum with corrosive impact on electrical switchboards.",
      latitude: 6.9497,
      longitude: 79.8437
    },
    rooms: [
      {
        id: "room_c1",
        buildingName: "Colombo Port Warehouse B",
        roomName: "Main Loading Dock",
        images: [],
        croppedImages: {},
        comments: "Busy vehicle access slab; structural expansion joints showing dirt wear.",
        assets: [
          {
            id: "asset_c1_1",
            name: "Overhead Shutting Gates",
            category: "Grounds & Gardens,Fences & Gates",
            description: "Industrial steel folding door shutter. Motorised chains are heavily dry rusted.",
            condition: "Fair",
            riskRating: "High",
            justification: "Wear on primary winding gears may lead to operational failure and physical crush hazards.",
            quantity: 1,
            cost: "6800",
            age: "12",
            rul: "3",
            verified: true,
            aiDetected: true,
            auditTrail: [
              { timestamp: Date.now() - 86400000, actor: "AI", action: "Detected Asset", details: "Initial visual identification from satellite thermal feed." }
            ]
          }
        ]
      },
      {
        id: "room_c2",
        buildingName: "Colombo Port Warehouse B",
        roomName: "Main Distribution Valve Room",
        images: [],
        croppedImages: {},
        comments: "DB boards run high thermal levels during active shift hours.",
        assets: [
          {
            id: "asset_c2_1",
            name: "Industrial Main Power Switchboard DB-01",
            category: "Electrical switchboards",
            description: "Distribution board casing showing slight thermal scorch marking on primary breaker connections.",
            condition: "Poor",
            riskRating: "Extreme",
            justification: "Risk of arc flashover or panel fire without urgent inspection or connection tight-ups.",
            quantity: 1,
            cost: "25000",
            age: "18",
            rul: "1",
            verified: true,
            aiDetected: true,
            auditTrail: [
              { timestamp: Date.now() - 36400000, actor: "AI", action: "Flagged Risk", details: "Elevated risk rating based on thermodynamic and humidity parameters." }
            ]
          }
        ]
      }
    ],
    lastUpdated: new Date().toISOString()
  },
  {
    id: "sydney_opera_house_annex",
    siteInfo: {
      name: "Sydney Opera House Annex",
      address: "Bennelong Point, Sydney NSW 2000, Australia",
      numRooms: 2,
      notes: "Heritage administration wing. Heavy requirements for architectural timber finish maintenance.",
      latitude: -33.8568,
      longitude: 151.2153
    },
    rooms: [
      {
        id: "room_s1",
        buildingName: "Sydney Opera House Annex",
        roomName: "Green Room Main Stage Entrance",
        images: [],
        croppedImages: {},
        comments: "Good general appearance, but floor timber lifting slightly.",
        assets: [
          {
            id: "asset_s1_1",
            name: "Polished Parquet Floor Panels",
            category: "Grounds & Gardens,Pathways & Paving",
            description: "Australian Oak tongue-and-groove timber flooring. Some surface lifting near hydration cooler.",
            condition: "Average",
            riskRating: "Medium",
            justification: "Plank edge elevation forms a minor trip hazard for high priority talent walkway.",
            quantity: 45,
            cost: "12500",
            age: "45",
            rul: "15",
            verified: true,
            aiDetected: false,
            auditTrail: []
          }
        ]
      },
      {
        id: "room_s2",
        buildingName: "Sydney Opera House Annex",
        roomName: "Plant Room Mechanical Vent",
        images: [],
        croppedImages: {},
        comments: "Vibration is high near the damper assembly.",
        assets: [
          {
            id: "asset_s2_1",
            name: "Axial Mechanical Exhaust Unit Motor 3",
            category: "HVAC",
            description: "Duct motor blower assembly. Heavy rattling audible under full peak velocity.",
            condition: "Fair",
            riskRating: "High",
            justification: "Persistent structural vibrating risks snapping the steel mounting frame brackets.",
            quantity: 1,
            cost: "5200",
            age: "11",
            rul: "2",
            verified: true,
            aiDetected: true,
            auditTrail: []
          }
        ]
      }
    ],
    lastUpdated: new Date().toISOString()
  },
  {
    id: "melbourne_central_hub",
    siteInfo: {
      name: "Melbourne Central Hub",
      address: "211 La Trobe St, Melbourne VIC 3000, Australia",
      numRooms: 1,
      notes: "Active commercial retail facility. General public fire exit accessways require daily tracking.",
      latitude: -37.8101,
      longitude: 144.9628
    },
    rooms: [
      {
        id: "room_m1",
        buildingName: "Melbourne Central Hub",
        roomName: "Plaza Utility HVAC Vent",
        images: [],
        croppedImages: {},
        comments: "Routine emergency devices checked.",
        assets: [
          {
            id: "asset_m1_1",
            name: "Pressurised CO2 Cylinder 5kg",
            category: "Fire Extinguishers",
            description: "Fire emergency device. Weight check reveals empty chamber; activation pin has been removed.",
            condition: "Poor",
            riskRating: "High",
            justification: "Completely inoperable asset during initial emergency reaction. Violation of fire safety regulations.",
            quantity: 1,
            cost: "180",
            age: "9",
            rul: "1",
            verified: true,
            aiDetected: false,
            auditTrail: [
              { timestamp: Date.now() - 43200000, actor: "USER", action: "Flagged Asset", details: "Manual inspection flag raised during walk-by site audit." }
            ]
          }
        ]
      }
    ],
    lastUpdated: new Date().toISOString()
  }
];

export class FirebaseService {
  
  // Helper to upload a single base64 image to Firebase Storage
  private async uploadImage(base64: string, path: string): Promise<string> {
    if (!storage) return base64;
    await authReady;
    try {
        const storageRef = ref(storage, path);
        await uploadString(storageRef, base64, 'data_url');
        return await getDownloadURL(storageRef);
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.warn("Storage upload deferred (using robust base64 local fallback):", errorMsg);
        return base64; 
    }
  }

  // Create lightweight thumbnail if image remains in base64 to protect Firestore 1MB quota
  private async createFirestoreThumbnail(dataUrl: string, maxDim = 480, quality = 0.55): Promise<string> {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width || 400;
          let height = img.naturalHeight || img.height || 300;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl.substring(0, 1000));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(dataUrl.substring(0, 1000));
        }
      };
      img.onerror = () => resolve(dataUrl.substring(0, 1000));
      img.src = dataUrl;
    });
  }

  // Robust saveState that registers offline pending queue if offline
  async saveState(siteInfo: SiteInfo, rooms: Room[]): Promise<void> {
    const inspectionId = siteInfo?.name ? siteInfo.name.trim().replace(/\s+/g, '_').toLowerCase() : 'draft_inspection';
    
    // 1. Save locally for current working draft
    try {
        await set('siteInfo', siteInfo);
        await set('rooms', rooms);
    } catch (e) {
        console.error("Failed to save draft to IndexedDB:", e);
    }

    // 2. Save inside general list map of all local inspections
    try {
        const localInspections = await get('all_local_inspections') || {};
        localInspections[inspectionId] = {
            id: inspectionId,
            siteInfo,
            rooms,
            lastUpdated: new Date().toISOString()
        };
        await set('all_local_inspections', localInspections);
        console.log(`Updated local database for "${siteInfo.name}"`);
    } catch (e) {
        console.error("Failed to save to local inspections catalog:", e);
    }

    // 3. Queue up sync action if offline or server is unconfigured
    if (!isConfigured || !db || !navigator.onLine) {
        try {
            const pendingQueue = await get('pending_sync_queue') || {};
            pendingQueue[inspectionId] = { siteInfo, rooms, queuedAt: new Date().toISOString() };
            await set('pending_sync_queue', pendingQueue);
            console.warn(`Saved locally. queued "${siteInfo.name}" for sync background pushing.`);
        } catch (e) {
            console.error("Failed to store in offline sync queue:", e);
        }
        return;
    }

    // 4. Trigger cloud-sync directly
    try {
        await this.saveStateToCloudDirect(siteInfo, rooms);
        
        // Ensure it is deleted from the pending sync queue since it has synced
        const pendingQueue = await get('pending_sync_queue') || {};
        if (pendingQueue[inspectionId]) {
            delete pendingQueue[inspectionId];
            await set('pending_sync_queue', pendingQueue);
        }
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn("Cloud direct save deferred (permissions/offline). Pushing to sync queue:", errMsg);
        try {
            const pendingQueue = await get('pending_sync_queue') || {};
            pendingQueue[inspectionId] = { 
                siteInfo, 
                rooms, 
                queuedAt: new Date().toISOString(),
                retryCount: 1,
                lastError: errMsg,
                lastAttempt: new Date().toISOString()
            };
            await set('pending_sync_queue', pendingQueue);
        } catch (queueErr) {
            console.error("Could not update pending queue:", queueErr);
        }
    }
  }

  // Main cloud sync logic
  async saveStateToCloudDirect(siteInfo: SiteInfo, rooms: Room[]): Promise<void> {
    if (!isConfigured || !db) return;
    await authReady;
    
    const inspectionId = siteInfo?.name ? siteInfo.name.trim().replace(/\s+/g, '_').toLowerCase() : 'draft_inspection';
    const inspectionDocRef = doc(db, "inspections", inspectionId);
    
    console.log(`Cloud Sync Initiated: ${siteInfo.name}`);
    
    const roomsForSave = JSON.parse(JSON.stringify(rooms || [])); 
    const siteInfoForSave = JSON.parse(JSON.stringify(siteInfo || {}));

    if (siteInfoForSave.documents) {
        for (let i = 0; i < siteInfoForSave.documents.length; i++) {
            const docItem = siteInfoForSave.documents[i];
            if (docItem.dataUrl && docItem.dataUrl.startsWith('data:')) {
                const ext = docItem.mimeType === 'application/pdf' ? 'pdf' : 'jpg';
                const cloudPath = `inspections/${inspectionId}/documents/${docItem.id}.${ext}`;
                const uploadedUrl = await this.uploadImage(docItem.dataUrl, cloudPath);
                // If upload failed, compress thumbnail for image documents; drop non-image
                // payloads (e.g. PDFs) so the Firestore document stays under the 1MB limit
                if (!uploadedUrl.startsWith('data:')) {
                    docItem.dataUrl = uploadedUrl;
                } else if (uploadedUrl.startsWith('data:image')) {
                    docItem.dataUrl = await this.createFirestoreThumbnail(uploadedUrl, 400, 0.5);
                } else {
                    delete docItem.dataUrl;
                }
            }
        }
    }

    for (const room of roomsForSave) {
        if (room.images) {
            for (let i = 0; i < room.images.length; i++) {
                const img = room.images[i];
                if (img.dataUrl && img.dataUrl.startsWith('data:image')) {
                    const cloudPath = `inspections/${inspectionId}/${room.id}/${img.id}.jpg`;
                    const uploaded = await this.uploadImage(img.dataUrl, cloudPath);
                    img.dataUrl = uploaded.startsWith('data:') 
                        ? await this.createFirestoreThumbnail(uploaded, 480, 0.5) 
                        : uploaded;
                }
            }
        }
        if (room.croppedImages) {
            for (const [assetId, dataUrl] of Object.entries(room.croppedImages)) {
                if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
                    const cloudPath = `inspections/${inspectionId}/${room.id}/assets/${assetId}_crop.jpg`;
                    const uploaded = await this.uploadImage(dataUrl, cloudPath);
                    room.croppedImages[assetId] = uploaded.startsWith('data:') 
                        ? await this.createFirestoreThumbnail(uploaded, 240, 0.5) 
                        : uploaded;
                }
            }
        }
    }

    try {
        await setDoc(inspectionDocRef, {
          siteInfo: siteInfoForSave,
          rooms: roomsForSave,
          lastUpdated: new Date().toISOString(),
          device: navigator.userAgent
        }, { merge: true });
    } catch (e: any) {
        console.warn("Firestore document write deferred:", e.message || e);
        throw e;
    }

    try {
        let batch = writeBatch(db); 
        let operationCount = 0;
        const MAX_BATCH_SIZE = 400; 

        for (const room of roomsForSave) {
            for (const asset of (room.assets || [])) {
                const assetRef = doc(db, `inspections/${inspectionId}/assets`, asset.id);
                
                const assetRecord = {
                    ...asset,
                    roomName: room.roomName,
                    buildingName: siteInfo.name,
                    timestamp: new Date().toISOString(),
                    ai_search_text: `Asset: ${asset.category}. Condition: ${asset.condition}. Description: ${asset.description}. Justification: ${asset.justification}. Cost: ${asset.cost}.`
                };

                batch.set(assetRef, assetRecord);
                operationCount++;
                
                if (operationCount >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    batch = writeBatch(db); 
                    operationCount = 0; 
                }
            }
        }

        if (operationCount > 0) {
            await batch.commit();
        }
    } catch (batchErr: any) {
        console.warn("Firestore sub-assets batch write deferred:", batchErr.message || batchErr);
        throw batchErr;
    }
    
    console.log(`✅ Cloud synchronization processed for: inspections/${inspectionId}`);
  }

  // Triggered when client restores connection
  async syncPendingQueue(onProgress?: (progressText: string) => void): Promise<number> {
    if (!isConfigured || !db || !navigator.onLine) return 0;

    let syncedItemsCount = 0;
    try {
        const pendingQueue = await get('pending_sync_queue') || {};
        const entries = Object.entries(pendingQueue);
        if (entries.length === 0) return 0;

        console.log(`📡 Background syncing initiated for ${entries.length} inspections...`);

        for (const [inspectionId, item] of entries) {
            const typedItem = item as { 
                siteInfo: SiteInfo; 
                rooms: Room[]; 
                retryCount?: number; 
                lastError?: string; 
                lastAttempt?: string; 
            };
            
            const retryCount = typedItem.retryCount || 0;
            const lastAttempt = typedItem.lastAttempt ? new Date(typedItem.lastAttempt).getTime() : 0;
            const now = Date.now();
            
            // Check if this queued item is blocked by persistent permission/auth errors
            const isPermissionError = typedItem.lastError && (
                typedItem.lastError.toLowerCase().includes("permission") || 
                typedItem.lastError.toLowerCase().includes("unauthorized") || 
                typedItem.lastError.toUpperCase().includes("PERMISSION_DENIED")
            );

            if (isPermissionError && retryCount >= 2) {
                // Wait at least 3 minutes (180,000 ms) before trying again to prevent infinite error loops and quota exhaustion
                if (now - lastAttempt < 180000) {
                    console.log(`Skipping automatic background sync retry for "${typedItem.siteInfo.name}" to prevent persistent authorization loops.`);
                    continue;
                }
            } else if (retryCount >= 5) {
                // Cooldown for any general failing sync (e.g. 1 minute)
                if (now - lastAttempt < 60000) {
                    continue;
                }
            }

            if (onProgress) {
                onProgress(`Syncing "${typedItem.siteInfo.name}"...`);
            }
            
            try {
                await this.saveStateToCloudDirect(typedItem.siteInfo, typedItem.rooms);
                syncedItemsCount++;
                
                // Delete key successfully uploaded
                const updatedQueue = await get('pending_sync_queue') || {};
                delete updatedQueue[inspectionId];
                await set('pending_sync_queue', updatedQueue);
                console.log(`✅ Fully Synchronized "${typedItem.siteInfo.name}" to Cloud.`);
            } catch (err: any) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.warn(`Sync attempt failed for "${typedItem.siteInfo.name}":`, errMsg);
                
                // Update queue item with error details and increment retry count without crashing the sync cycle
                const updatedQueue = await get('pending_sync_queue') || {};
                if (updatedQueue[inspectionId]) {
                    updatedQueue[inspectionId] = {
                        ...updatedQueue[inspectionId],
                        retryCount: retryCount + 1,
                        lastError: errMsg,
                        lastAttempt: new Date().toISOString()
                    };
                    await set('pending_sync_queue', updatedQueue);
                }
            }
        }
    } catch (e) {
        console.error("Failed to complete automatic background sync process:", e);
    }
    return syncedItemsCount;
  }

  // Get count of queued items not pushed to Firebase
  async getPendingQueueCount(): Promise<number> {
      try {
          const pendingQueue = await get('pending_sync_queue') || {};
          return Object.keys(pendingQueue).length;
      } catch (e) {
          return 0;
      }
  }

  // Get list of lastError messages recorded in the queue items
  async getPendingQueueErrors(): Promise<string[]> {
      try {
          const pendingQueue = await get('pending_sync_queue') || {};
          return Object.values(pendingQueue)
              .map((item: any) => item.lastError)
              .filter((err): err is string => !!err);
      } catch (e) {
          return [];
      }
  }

  async loadState(): Promise<{ siteInfo: SiteInfo | null, rooms: Room[] }> {
    const offlineSiteInfo = await get('siteInfo');
    const offlineRooms = await get('rooms');
    
    let result = {
        siteInfo: offlineSiteInfo || null,
        rooms: offlineRooms || []
    };

    if (isConfigured && db && result.siteInfo?.name && navigator.onLine) {
        const inspectionId = result.siteInfo.name.trim().replace(/\s+/g, '_').toLowerCase();
        try {
            // Local edits still waiting to sync are newer than the cloud copy; don't clobber them
            const pendingQueue = await get('pending_sync_queue') || {};
            if (pendingQueue[inspectionId]) return result;

            await authReady;
            const docRef = doc(db, "inspections", inspectionId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("✅ Loaded latest data from Firestore");
                return {
                    siteInfo: data.siteInfo as SiteInfo,
                    rooms: data.rooms as Room[]
                };
            }
        } catch (e: any) {
            console.warn("⚠️ Cloud reading from Firestore deferred (using local cache):", e.message || e);
        }
    }

    return result;
  }

  async getAllInspections(): Promise<any[]> {
      let localInspections = await get('all_local_inspections') || {};

      // Seed mock inspections if empty so user has high-quality demo data out-of-the-box
      if (Object.keys(localInspections).length === 0) {
          console.log("🌱 Database is empty. Seeding initial properties for Sri Lanka and Australia...");
          localInspections = {};
          SEEDED_INSPECTIONS.forEach(ins => {
              localInspections[ins.id] = ins;
          });
          await set('all_local_inspections', localInspections);
      }

      const offlineList = Object.values(localInspections);

      if (!isConfigured || !db || !navigator.onLine) {
          return offlineList;
      }

      try {
          await authReady;
          const colRef = collection(db, "inspections");
          const snapshot = await getDocs(colRef);
          const cloudList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          // Merge cloud inspections into local inspections list (keep offline available)
          const localMap = { ...localInspections };
          cloudList.forEach((ins: any) => {
              localMap[ins.id] = ins;
          });
          await set('all_local_inspections', localMap);

          return Object.values(localMap);
      } catch (e: any) {
          console.error("Error fetching inspections from Firestore:", e.message);
          if (e.code === 'permission-denied' || e.message?.toLowerCase().includes('permission') || e.message?.toLowerCase().includes('unauthorized')) {
              // handleFirestoreError logs diagnostic info then throws; fall back to offline data instead
              try { handleFirestoreError(e, OperationType.GET, "inspections"); } catch { /* logged */ }
          }
          return offlineList;
      }
  }

  // Real-time Presence API for Multi-Inspector collaboration
  async updatePresence(inspectionId: string, userId: string, email: string, isEditing: boolean, editClaimedAt: number = 0): Promise<void> {
    if (!isConfigured || !db) return;
    await authReady;
    const docRef = doc(db, "inspections", inspectionId, "presence", userId);
    try {
        await setDoc(docRef, {
            userId,
            email,
            lastActive: new Date().toISOString(),
            isEditing,
            editClaimedAt,
            device: navigator.userAgent
        }, { merge: true });
    } catch (e) {
        console.warn("Failed to update presence:", e);
    }
  }

  listenToPresence(inspectionId: string, callback: (presences: any[]) => void): () => void {
    if (!isConfigured || !db) {
        callback([]);
        return () => {};
    }
    const colRef = collection(db, "inspections", inspectionId, "presence");
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    authReady.then(() => {
        if (cancelled) return;
        unsubscribe = onSnapshot(colRef, (snapshot: any) => {
            const list = snapshot.docs.map((d: any) => d.data());
            callback(list);
        }, (err: any) => {
            console.warn("Presence listen error:", err);
            callback([]);
        });
    });
    return () => {
        cancelled = true;
        if (unsubscribe) unsubscribe();
    };
  }

  async removePresence(inspectionId: string, userId: string): Promise<void> {
    if (!isConfigured || !db) return;
    await authReady;
    const docRef = doc(db, "inspections", inspectionId, "presence", userId);
    try {
        await deleteDoc(docRef);
    } catch (e) {
        console.warn("Failed to remove presence:", e);
    }
  }

  async deleteDatabase(): Promise<void> {
    await clear();
    localStorage.clear();
    console.log("✅ Local Offline DB cleared");
  }
}

export const firebaseService = new FirebaseService();
