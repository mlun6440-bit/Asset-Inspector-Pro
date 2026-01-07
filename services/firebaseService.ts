
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, writeBatch, getDocs } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { Room, SiteInfo } from '../types';

// ==============================================================
// FIREBASE CONFIGURATION (Connected to 'building-asset-capture')
// ==============================================================
const firebaseConfig = {
  apiKey: "AIzaSyALGJMHG6fYH6ZztUEtLfjTE_reU1C8yXU",
  authDomain: "building-asset-capture.firebaseapp.com",
  projectId: "building-asset-capture",
  storageBucket: "building-asset-capture.firebasestorage.app",
  messagingSenderId: "626380950826", 
  appId: "1:626380950826:web:1cf13f91456df047596253" 
};

// Initialize Firebase
let db: any;
let storage: any;
let isConfigured = false;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    isConfigured = true;
    console.log("✅ Firebase Initialized: DB + Storage Ready");
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

export class FirebaseService {
  
  // Helper to upload a single base64 image to Firebase Storage
  private async uploadImage(base64: string, path: string): Promise<string> {
    if (!storage) return base64;
    try {
        const storageRef = ref(storage, path);
        await uploadString(storageRef, base64, 'data_url');
        return await getDownloadURL(storageRef);
    } catch (e) {
        console.error("Image Upload Failed:", e);
        return base64; 
    }
  }

  async saveState(siteInfo: SiteInfo, rooms: Room[]): Promise<void> {
    if (!isConfigured || !db) {
      console.warn("Saving to LocalStorage (Firebase Error)");
      localStorage.setItem('siteInfo', JSON.stringify(siteInfo));
      localStorage.setItem('rooms', JSON.stringify(rooms));
      return;
    }

    try {
      // 1. Define Hierarchy
      const inspectionId = siteInfo.name.trim().replace(/\s+/g, '_').toLowerCase() || 'draft_inspection';
      const inspectionDocRef = doc(db, "inspections", inspectionId);
      
      console.log(`Phase 1: Uploading Images to Cloud Bucket...`);
      
      // 2. Image Processing (Upload Base64 -> Get URL)
      // We process a clone to avoid mutating React state directly
      const roomsForSave = JSON.parse(JSON.stringify(rooms)); 

      for (const room of roomsForSave) {
          // Upload Room Images
          if (room.images) {
              for (let i = 0; i < room.images.length; i++) {
                  const img = room.images[i];
                  if (img.dataUrl && img.dataUrl.startsWith('data:image')) {
                      const cloudPath = `inspections/${inspectionId}/${room.id}/${img.id}.jpg`;
                      img.dataUrl = await this.uploadImage(img.dataUrl, cloudPath);
                  }
              }
          }
          // Upload Cropped Asset Images
          if (room.croppedImages) {
              for (const [assetId, dataUrl] of Object.entries(room.croppedImages)) {
                  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
                      const cloudPath = `inspections/${inspectionId}/${room.id}/assets/${assetId}_crop.jpg`;
                      room.croppedImages[assetId] = await this.uploadImage(dataUrl, cloudPath);
                  }
              }
          }
      }

      console.log(`Phase 2: Saving "Memory" (Main Document)...`);
      
      // 3. Save Main Document (For App Performance)
      await setDoc(inspectionDocRef, {
        siteInfo,
        rooms: roomsForSave,
        lastUpdated: new Date().toISOString(),
        device: navigator.userAgent
      }, { merge: true });

      console.log(`Phase 3: Building "Vector Search" Index (Sub-collections)...`);

      // 4. Save Individual Assets (For Vector Search / Layer B)
      // FIX: Use 'let' for batch so we can re-assign it after commit
      let batch = writeBatch(db); 
      let operationCount = 0;
      const MAX_BATCH_SIZE = 450; // Firestore limit is 500, playing safe

      for (const room of roomsForSave) {
          for (const asset of room.assets) {
              const assetRef = doc(db, `inspections/${inspectionId}/assets`, asset.id);
              
              // This structure is optimized for AI Vector Search
              const assetRecord = {
                  ...asset,
                  roomName: room.roomName,
                  buildingName: siteInfo.name,
                  timestamp: new Date().toISOString(),
                  ai_search_text: `Asset: ${asset.category}. Condition: ${asset.condition}. Description: ${asset.description}. Justification: ${asset.justification}. Cost: ${asset.cost}.`
              };

              batch.set(assetRef, assetRecord);
              operationCount++;
              
              // Commit if batch is full and start a new one
              if (operationCount >= MAX_BATCH_SIZE) {
                  await batch.commit();
                  console.log(`Saved batch of ${operationCount} assets...`);
                  batch = writeBatch(db); // Create new batch
                  operationCount = 0; 
              }
          }
      }

      // Commit remaining
      if (operationCount > 0) {
          await batch.commit();
      }
      
      console.log(`✅ Full Cloud Sync Complete: inspections/${inspectionId}`);

    } catch (e) {
      console.error("❌ Cloud Sync Error:", e);
      // Fallback
      localStorage.setItem('siteInfo', JSON.stringify(siteInfo));
      localStorage.setItem('rooms', JSON.stringify(rooms));
    }
  }

  async loadState(): Promise<{ siteInfo: SiteInfo | null, rooms: Room[] }> {
    const localSiteInfo = localStorage.getItem('siteInfo');
    const localRooms = localStorage.getItem('rooms');
    
    let result = {
        siteInfo: localSiteInfo ? JSON.parse(localSiteInfo) : null,
        rooms: localRooms ? JSON.parse(localRooms) : []
    };

    if (isConfigured && db && result.siteInfo?.name) {
        try {
            const inspectionId = result.siteInfo.name.trim().replace(/\s+/g, '_').toLowerCase();
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
        } catch (e) {
            console.warn("⚠️ Using local data (Offline or Cloud Error)");
        }
    }

    return result;
  }

  // --- FETCH ALL INSPECTIONS FOR DASHBOARD ---
  async getAllInspections(): Promise<any[]> {
      if (!isConfigured || !db) {
          // Fallback: return the single local inspection if it exists
          const s = localStorage.getItem('siteInfo');
          const r = localStorage.getItem('rooms');
          if (s && r) {
            return [{
              siteInfo: JSON.parse(s),
              rooms: JSON.parse(r),
              lastUpdated: new Date().toISOString()
            }];
          }
          return [];
      }

      try {
          const colRef = collection(db, "inspections");
          const snapshot = await getDocs(colRef);
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
          console.error("Error fetching inspections:", e);
          return [];
      }
  }

  async deleteDatabase(): Promise<void> {
    localStorage.clear();
    alert("Local device cache cleared. (Cloud data preserved)");
  }
}

export const firebaseService = new FirebaseService();
