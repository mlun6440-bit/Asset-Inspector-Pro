
import React, { useState, useEffect } from 'react';
import { SiteInfo, Room, AppState, Asset, ChatMessage, AuditEntry } from './types';
import { firebaseService } from './services/firebaseService';
import { detectAssetsWithBoundingBoxes, cropImage, summarizeConversation } from './services/geminiService';
import { ChatBot } from './components/ChatBot';

// ============================================================================
// STRICT BUILDING FABRIC & SERVICES LIST (No Furniture/Appliances)
// ============================================================================
const ASSET_CATEGORIES = [
    // --- BUILDING FABRIC ---
    "Building Structural & Fabric,Walls",
    "Building Structural & Fabric,Paintwork",
    "Building Structural & Fabric,Roofing",
    "Building Structural & Fabric,Guttering",
    "Building Structural & Fabric,Flooring",
    "Building Structural & Fabric,Facade",
    "Building Structural & Fabric,Ceiling",
    "Building Structural & Fabric,Windows",
    "Building Structural & Fabric,Window Shades & Furnishings", // Blinds (Fixed)
    "Building Structural & Fabric,Stairs & Ramps",
    "Building Structural & Fabric,Security Barriers & Structures",
    "Building Structural & Fabric,Roller Doors",
    "Building Structural & Fabric,Height Safety",
    "Building Structural & Fabric,Fire/Smoke/Exit Door",
    "Building Structural & Fabric,Doors & Door Hardware",
    "Building Structural & Fabric,Disabled Access",
    "Building Structural & Fabric,Automatic Doors",
    "Building Structural & Fabric,Signage & Livery (Non-Powered)",
    "Building Structural & Fabric,Signage & Livery (Powered)",

    // --- ELECTRICAL SERVICES ---
    "Electrical Systems,Switchgear",
    "Electrical Systems,Main Switchboard",
    "Electrical Systems,Distribution Board",
    "Electrical Systems,Lighting",
    "Electrical Systems,Emergency & Exit Lighting",
    "Electrical Systems,Electrical Switches & Outlets",
    "Electrical Systems,Electrical Distribution",
    "Electrical Systems,Solar Power",
    "Electrical Systems,UPS",
    "Electrical Systems,Power Factor Correction",
    "Electrical Systems,Lightning Protection",
    "Electrical Systems,Emergency Power Generation",
    "Electrical Systems,Electricity Meter",
    "Electrical Systems,Electrical Transformer",
    
    // --- HVAC & MECHANICAL ---
    "HVAC & Refrigeration,Air Handling Units",
    "HVAC & Refrigeration,Split AC",
    "HVAC & Refrigeration,Ducted AC",
    "HVAC & Refrigeration,VRV System",
    "HVAC & Refrigeration,Chillers",
    "HVAC & Refrigeration,Cooling Towers",
    "HVAC & Refrigeration,Boilers",
    "HVAC & Refrigeration,Fans",
    "HVAC & Refrigeration,Ductwork",
    "HVAC & Refrigeration,Diffusers & Grilles",
    "HVAC & Refrigeration,HVAC Control / BMS",
    "HVAC & Refrigeration,Heaters",
    "HVAC & Refrigeration,Pumps",
    "HVAC & Refrigeration,Fire Dampers",

    // --- PLUMBING ---
    "Plumbing Systems,Toilets & Urinals",
    "Plumbing Systems,Sinks & Basins",
    "Plumbing Systems,Taps & Mixers",
    "Plumbing Systems,Showers",
    "Plumbing Systems,Hot Water Service",
    "Plumbing Systems,Water Tanks",
    "Plumbing Systems,Pumps",
    "Plumbing Systems,Valves & Backflow Prevention",
    "Plumbing Systems,Stormwater Drains",
    "Plumbing Systems,Floor Wastes",
    "Plumbing Systems,Sewage System",
    "Plumbing Systems,Water Meter",
    "Plumbing Systems,Fire Hydrants & Hose Reels",
    "Plumbing Systems,Sprinkler System",

    // --- FIRE & SAFETY ---
    "Fire Systems,Fire Detection (Smoke/Thermal)",
    "Fire Systems,Fire Alarm Panel (FIP)",
    "Fire Systems,EWIS (Warning System)",
    "Fire Systems,Fire Extinguishers",
    "Fire Systems,Fire Blankets",
    "Fire Systems,Gas Suppression System",

    // --- SECURITY & TRANSPORT ---
    "Security Systems,CCTV Cameras",
    "Security Systems,Access Control Readers",
    "Security Systems,Security Alarm Sensors",
    "Transportation Systems,Lifts / Elevators",
    "Transportation Systems,Escalators",
    
    // --- GROUNDS (STRUCTURAL) ---
    "Grounds & Gardens,Roads & Driveways",
    "Grounds & Gardens,Pathways & Paving",
    "Grounds & Gardens,Fences & Gates",
    "Grounds & Gardens,Retaining Walls",
    "Grounds & Gardens,Car Park Linemarking"
];

const CONDITION_OPTIONS = ['Excellent', 'Good', 'Average', 'Fair', 'Poor'];
const RISK_OPTIONS = ['Low', 'Medium', 'High', 'Extreme'];

const INITIAL_ROOM_STATE: Room = {
  id: '',
  buildingName: '',
  roomName: '',
  images: [],
  assets: [],
  croppedImages: {},
  comments: ''
};

function App() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  
  // NEW: Portfolio Data State
  const [portfolioData, setPortfolioData] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'single' | 'portfolio'>('single');

  const [appState, setAppState] = useState<AppState>({
    siteInfo: { name: '', address: '', numRooms: 5, notes: '' },
    rooms: [],
    currentRoomIndex: 0,
    view: 'welcome',
    privacyMode: false
  });

  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  
  // NEW: Image Preview State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // NEW: Lifted Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { siteInfo, rooms } = await firebaseService.loadState();
        if (siteInfo && rooms.length > 0) {
          setAppState(prev => ({
            ...prev,
            siteInfo,
            rooms,
            view: 'assessment',
            currentRoomIndex: 0
          }));
        }
      } catch (err) {
        console.error("Failed to load state", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // --- Initialize Chat Messages ---
  useEffect(() => {
    const initialGreeting = viewMode === 'portfolio' 
      ? 'Hello. I am your Portfolio Strategist. I have loaded all inspection data from Firebase. Ask me to compare sites, find risks, or forecast CAPEX.'
      : 'Hello. I am your ISO 55001:2024 Engineering Asset Manager. I am ready to analyze this specific building for risks and remedial works.';
      
    setChatMessages([{
        id: 'init-' + viewMode,
        role: 'model',
        text: initialGreeting,
        timestamp: Date.now()
    }]);
  }, [viewMode]);

  // --- Portfolio Functions ---
  const loadPortfolio = async () => {
      setLoading(true);
      const data = await firebaseService.getAllInspections();
      setPortfolioData(data);
      setViewMode('portfolio');
      setLoading(false);
  };

  // --- State Updates & Helpers ---

  const handleSiteInfoChange = (field: keyof SiteInfo, value: any) => {
    setAppState(prev => ({
      ...prev,
      siteInfo: { ...prev.siteInfo, [field]: value }
    }));
  };

  const saveGlobalState = () => {
    firebaseService.saveState(appState.siteInfo, appState.rooms);
  };

  const startAssessment = () => {
    const newRooms = Array.from({ length: appState.siteInfo.numRooms }).map((_, i) => ({
      ...INITIAL_ROOM_STATE,
      id: crypto.randomUUID(),
      roomName: i === 0 ? 'Building Exterior' : `Room ${i}`,
      buildingName: appState.siteInfo.name
    }));
    
    setAppState(prev => ({
      ...prev,
      rooms: newRooms,
      view: 'assessment',
      currentRoomIndex: 0
    }));
    firebaseService.saveState(appState.siteInfo, newRooms);
  };

  const updateCurrentRoom = (updates: Partial<Room>) => {
    setAppState(prev => {
      const newRooms = [...prev.rooms];
      newRooms[prev.currentRoomIndex] = { ...newRooms[prev.currentRoomIndex], ...updates };
      firebaseService.saveState(prev.siteInfo, newRooms);
      return { ...prev, rooms: newRooms };
    });
  };

  const createAuditEntry = (action: string, details: string): AuditEntry => ({
      timestamp: Date.now(),
      actor: 'USER',
      action,
      details
  });

  const updateAsset = (assetId: string, field: keyof Asset, value: any) => {
    const room = appState.rooms[appState.currentRoomIndex];
    const updatedAssets = room.assets.map(a => {
      if (a.id === assetId) {
          // Log the change
          const log = createAuditEntry('UPDATE', `Changed ${field} from '${a[field]}' to '${value}'`);
          return { 
              ...a, 
              [field]: value,
              auditTrail: [...(a.auditTrail || []), log]
          };
      }
      return a;
    });
    updateCurrentRoom({ assets: updatedAssets });
  };

  const saveEditedAsset = () => {
      if(!editingAsset) return;
      const room = appState.rooms[appState.currentRoomIndex];
      const updatedAssets = room.assets.map(a => {
        if (a.id === editingAsset.id) {
            // Compare and Log changes for key fields
            const changes: string[] = [];
            if(a.condition !== editingAsset.condition) changes.push(`Condition: ${a.condition} -> ${editingAsset.condition}`);
            if(a.riskRating !== editingAsset.riskRating) changes.push(`Risk: ${a.riskRating} -> ${editingAsset.riskRating}`);
            
            let newTrail = [...(a.auditTrail || [])];
            if (changes.length > 0) {
                 newTrail.push(createAuditEntry('BULK_EDIT', changes.join(', ')));
            } else {
                 newTrail.push(createAuditEntry('EDIT', 'Updated asset details'));
            }

            return { ...editingAsset, auditTrail: newTrail };
        }
        return a;
      });
      updateCurrentRoom({ assets: updatedAssets });
      setEditingAsset(null);
  };

  // --- IMPROVED LOCATION DETECTION (BUG FIX) ---
  const detectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    
    setLoadingText("Detecting location...");
    setProcessing(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let addressFound = false;

        // Strategy: photon.komoot.io (Free, No Key, CORS friendly)
        try {
          const response = await fetch(
            `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const props = data.features[0].properties;
                const parts = [
                    props.name,
                    props.street, 
                    props.city, 
                    props.state, 
                    props.country
                ].filter(Boolean);
                
                if (parts.length > 0) {
                    // Remove duplicates (sometimes name == street)
                    const uniqueParts = [...new Set(parts)];
                    handleSiteInfoChange('address', uniqueParts.join(', '));
                    addressFound = true;
                }
            }
          }
        } catch (e) {
          console.warn("Geocoding failed", e);
        }

        // Fallback: Raw Coordinates
        if (!addressFound) {
            handleSiteInfoChange('address', `Lat: ${latitude.toFixed(5)}, Long: ${longitude.toFixed(5)}`);
        }

        setProcessing(false);
        setLoadingText("");
      },
      (error) => {
        console.error("Geolocation error", error);
        let msg = "Location error.";
        if (error.code === 1) msg = "Location permission denied. Please allow location access.";
        else if (error.code === 2) msg = "Location unavailable (GPS signal lost).";
        else if (error.code === 3) msg = "Location request timed out.";
        
        // FIX: Use error.message property to avoid [object Object]
        alert(`${msg} (Details: ${error.message || 'Unknown'})`);
        
        setProcessing(false);
        setLoadingText("");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const togglePrivacyMode = () => {
      setAppState(prev => ({ ...prev, privacyMode: !prev.privacyMode }));
  };

  // --- AI & Image Handling ---

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files: File[] = Array.from(e.target.files);
    
    const currentRoom = appState.rooms[appState.currentRoomIndex];
    if (currentRoom.images.length + files.length > 5) {
        alert("Max 5 images per room.");
        return;
    }

    const newImages = await Promise.all(files.map(file => {
      return new Promise<{id: string, dataUrl: string, name: string, timestamp: number}>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve({
            id: crypto.randomUUID(),
            dataUrl: event.target?.result as string,
            name: file.name,
            timestamp: Date.now()
          });
        };
        reader.readAsDataURL(file);
      });
    }));

    updateCurrentRoom({ images: [...currentRoom.images, ...newImages] });
  };

  const generateAssetsWithAI = async () => {
    const currentRoom = appState.rooms[appState.currentRoomIndex];
    if (currentRoom.images.length === 0) return;

    setProcessing(true);
    setLoadingText('Analyzing Building Fabric & Services...');

    try {
      // 1. Preserve "Human Verified" assets (locked).
      const lockedAssets = currentRoom.assets.filter(a => a.verified);

      // Pass the STRICT category list to the AI
      const detectedAssets = await detectAssetsWithBoundingBoxes(currentRoom.images, ASSET_CATEGORIES, appState.privacyMode);
      
      setLoadingText('Cropping asset images...');
      const newCroppedImages = { ...currentRoom.croppedImages };
      
      for (const asset of detectedAssets) {
        if (asset.boundingBox && asset.sourceImageIndex !== undefined) {
           // Safety check: ensure index is valid
           if (asset.sourceImageIndex >= 0 && asset.sourceImageIndex < currentRoom.images.length) {
               const sourceImg = currentRoom.images[asset.sourceImageIndex];
               if (sourceImg && sourceImg.dataUrl.startsWith('data:image')) {
                   const croppedDataUrl = await cropImage(sourceImg.dataUrl, asset.boundingBox);
                   newCroppedImages[asset.id] = croppedDataUrl;
               }
           }
        }
      }

      // 2. Simple Client-side deduplication against verified assets
      const uniqueNewAssets = detectedAssets.filter(newA => 
         !lockedAssets.some(lockedA => 
             lockedA.category === newA.category && 
             lockedA.description.toLowerCase() === newA.description.toLowerCase()
         )
      );

      updateCurrentRoom({ 
          assets: [...lockedAssets, ...uniqueNewAssets],
          croppedImages: newCroppedImages
      });

    } catch (e) {
      console.error(e);
      alert("AI Generation failed. Check console.");
    } finally {
      setProcessing(false);
      setLoadingText('');
    }
  };

  // --- Batch Operations ---

  const toggleBatchMode = () => {
      setBatchMode(!batchMode);
      setSelectedAssetIds(new Set());
  };

  const toggleAssetSelection = (id: string) => {
      const newSet = new Set(selectedAssetIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedAssetIds(newSet);
  };

  const batchAction = (action: 'verify' | 'unverify' | 'delete') => {
      const currentRoom = appState.rooms[appState.currentRoomIndex];
      let updatedAssets = [...currentRoom.assets];

      if (action === 'delete') {
          if (!confirm(`Delete ${selectedAssetIds.size} assets?`)) return;
          updatedAssets = updatedAssets.filter(a => !selectedAssetIds.has(a.id));
      } else {
          const verifyStatus = action === 'verify';
          const logMsg = verifyStatus ? 'Batch Verified' : 'Batch Unverified';
          updatedAssets = updatedAssets.map(a => 
              selectedAssetIds.has(a.id) ? { 
                  ...a, 
                  verified: verifyStatus,
                  auditTrail: [...(a.auditTrail || []), createAuditEntry('BATCH', logMsg)]
              } : a
          );
      }

      updateCurrentRoom({ assets: updatedAssets });
      setSelectedAssetIds(new Set());
  };

  // --- Export Functions ---

  const exportToExcel = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) return alert("Export library not loaded");

    const wb = XLSX.utils.book_new();

    appState.rooms.forEach(room => {
        if (room.assets.length === 0) return;
        const data = [
            ['Category', 'Description', 'Condition', 'Risk', 'Age (yrs)', 'Justification', 'Notes', 'Qty', 'Cost ($)', 'RUL (yrs)', 'Verified', 'Last Action'],
            ...room.assets.map(a => {
                const lastLog = a.auditTrail && a.auditTrail.length > 0 ? a.auditTrail[a.auditTrail.length - 1] : null;
                const lastAction = lastLog ? `${lastLog.action} (${lastLog.actor})` : 'N/A';
                return [
                    a.category, 
                    a.description, 
                    a.condition, 
                    a.riskRating || 'Low',
                    a.age || '',
                    a.justification, 
                    a.notes || '', 
                    a.quantity, 
                    a.cost, 
                    a.rul, 
                    a.verified ? 'Yes' : 'No',
                    lastAction
                ];
            })
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const safeName = (room.roomName || 'Room').substring(0, 31).replace(/[\[\]\*\?\/\\\:]/g, '');
        XLSX.utils.book_append_sheet(wb, ws, safeName);
    });

    // Add Executive Summary Sheet
    const summaryData = [
        ['Site Name', appState.siteInfo.name],
        ['Address', appState.siteInfo.address],
        ['Site Notes / Executive Summary', appState.siteInfo.notes || '']
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Site Notes");

    XLSX.writeFile(wb, `${appState.siteInfo.name}_Assessment.xlsx`);
  };

  const exportToPDF = () => {
      const jspdf = (window as any).jspdf;
      if (!jspdf) return alert("PDF library not loaded");
      
      const doc = new jspdf.jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      doc.setFontSize(20);
      doc.text(appState.siteInfo.name, 14, 20);
      doc.setFontSize(12);
      doc.text(`Address: ${appState.siteInfo.address}`, 14, 30);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);

      // Add Executive Summary
      if (appState.siteInfo.notes) {
        doc.setFontSize(14);
        doc.text("Executive Summary / Site Notes", 14, 50);
        doc.setFontSize(10);
        const splitNotes = doc.splitTextToSize(appState.siteInfo.notes, 270);
        doc.text(splitNotes, 14, 58);
      }

      let startY = 80;

      appState.rooms.forEach((room, i) => {
          if (room.assets.length === 0 && room.images.length === 0) return;
          
          if (startY > pageHeight - 40) {
              doc.addPage();
              startY = 20;
          }

          doc.setFontSize(14);
          doc.setTextColor(0,0,0);
          doc.text(room.roomName, 14, startY);
          startY += 8;

          // --- ADD ROOM IMAGES ---
          if (room.images && room.images.length > 0) {
              const imgWidth = 60;
              const imgHeight = 45;
              const gap = 5;
              let xOffset = 14;

              // Ensure we have space for at least one row of images
              if (startY + imgHeight > pageHeight - 20) {
                  doc.addPage();
                  startY = 20;
              }

              room.images.forEach((img) => {
                  // Check horizontal overflow
                  if (xOffset + imgWidth > pageWidth - 14) {
                      xOffset = 14;
                      startY += imgHeight + gap;
                      
                      // Check vertical overflow
                      if (startY + imgHeight > pageHeight - 20) {
                          doc.addPage();
                          startY = 20;
                      }
                  }

                  try {
                      // Attempt to add image
                      if (img.dataUrl) {
                          doc.addImage(img.dataUrl, xOffset, startY, imgWidth, imgHeight);
                      }
                  } catch (e) {
                      console.error("Failed to add PDF image", e);
                      doc.setFontSize(8);
                      doc.text("[Image Error]", xOffset, startY + 10);
                  }
                  
                  xOffset += imgWidth + gap;
              });
              
              startY += imgHeight + 10;
          }

          if (room.assets.length > 0) {
              if (startY > pageHeight - 30) {
                  doc.addPage();
                  startY = 20;
              }

              (doc as any).autoTable({
                  startY: startY,
                  head: [['Category', 'Description', 'Condition', 'Risk', 'Age', 'Justification', 'Notes', 'Qty', 'Cost', 'RUL', 'Verified']],
                  body: room.assets.map(a => [
                      a.category,
                      a.description.substring(0, 40),
                      a.condition,
                      a.riskRating || 'Low',
                      a.age || '',
                      a.justification.substring(0, 40),
                      a.notes ? a.notes.substring(0, 40) : '',
                      a.quantity,
                      `$${a.cost}`,
                      `${a.rul} yr`,
                      a.verified ? 'Yes' : 'No'
                  ]),
                  theme: 'grid',
                  headStyles: { fillColor: [102, 126, 234] },
                  columnStyles: { 
                      0: { cellWidth: 25 }, 
                      1: { cellWidth: 30 }, 
                      2: { cellWidth: 20 }, 
                      3: { cellWidth: 15 }, 
                      4: { cellWidth: 10 }, // Age
                      5: { cellWidth: 30 }, 
                      6: { cellWidth: 30 }, 
                      7: { cellWidth: 12 }, 
                      8: { cellWidth: 18 }, 
                      9: { cellWidth: 12 }, 
                      10: { cellWidth: 12 } 
                  }
              });

              startY = (doc as any).lastAutoTable.finalY + 15;
          } else {
              startY += 10;
          }
      });

      doc.save(`${appState.siteInfo.name}_Report.pdf`);
  };

  const exportForRAG = () => {
      const data = appState.rooms.flatMap(room => 
          room.assets.map(asset => ({
              id: asset.id,
              content: `${appState.siteInfo.name}, ${room.roomName}: ${asset.category} - ${asset.description}. Condition: ${asset.condition}. Risk: ${asset.riskRating || 'Low'}. Age: ${asset.age || 'Unknown'}. Justification: ${asset.justification}. Notes: ${asset.notes}`,
              metadata: { building: appState.siteInfo.name, room: room.roomName, category: asset.category, cost: asset.cost, condition: asset.condition, risk: asset.riskRating, age: asset.age, auditLog: asset.auditTrail }
          }))
      );
      
      // Include summary note as a RAG entry
      if (appState.siteInfo.notes) {
          data.push({
              id: 'site-summary',
              content: `Site Executive Summary for ${appState.siteInfo.name}: ${appState.siteInfo.notes}`,
              metadata: { building: appState.siteInfo.name, room: 'Summary', category: 'General', cost: '0', condition: 'N/A', risk: 'N/A', auditLog: [] }
          });
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appState.siteInfo.name}_RAG.json`;
      a.click();
  };

  const goToNextPage = async () => {
      if (appState.currentRoomIndex < appState.rooms.length - 1) {
          setAppState(prev => ({ ...prev, currentRoomIndex: prev.currentRoomIndex + 1 }));
      } else {
          // ENTERING SUMMARY VIEW
          setAppState(prev => ({ ...prev, view: 'summary' }));
          
          // Trigger Chat Summarization
          if (chatMessages.length > 2 && (!appState.siteInfo.notes || appState.siteInfo.notes.trim() === '')) {
              setLoadingText("Summarizing chat history into site notes...");
              setProcessing(true);
              try {
                  const summary = await summarizeConversation(chatMessages);
                  if (summary) {
                      setAppState(prev => {
                          const updated = {
                              ...prev,
                              siteInfo: { ...prev.siteInfo, notes: summary }
                          };
                          // Save to persistence
                          firebaseService.saveState(updated.siteInfo, updated.rooms);
                          return updated;
                      });
                  }
              } catch (e) {
                  console.error("Auto-summary failed", e);
              } finally {
                  setProcessing(false);
                  setLoadingText('');
              }
          }
      }
  };

  const goToPrevPage = () => {
      if (appState.currentRoomIndex > 0) {
          setAppState(prev => ({ ...prev, currentRoomIndex: prev.currentRoomIndex - 1 }));
      } else {
          setAppState(prev => ({ ...prev, view: 'welcome' }));
      }
  };
  
  const handleReset = async () => {
    if (window.confirm("Delete ALL data and restart?")) {
        await firebaseService.deleteDatabase();
        window.location.reload();
    }
  };

  const loadDemo = () => {
      setAppState(prev => ({
          ...prev,
          siteInfo: { name: "Dubbo Civic Centre", address: "15 Darling St, Dubbo NSW", numRooms: 3, notes: '' },
          rooms: [
            { ...INITIAL_ROOM_STATE, id: '1', roomName: 'Foyer', buildingName: 'Dubbo Civic', assets: [], images: [] },
            { ...INITIAL_ROOM_STATE, id: '2', roomName: 'Main Hall', buildingName: 'Dubbo Civic', assets: [], images: [] },
            { ...INITIAL_ROOM_STATE, id: '3', roomName: 'Kitchen', buildingName: 'Dubbo Civic', assets: [], images: [] }
          ],
          view: 'assessment',
          currentRoomIndex: 0
      }));
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-indigo-600 animate-pulse text-xl">Loading Asset Inspector...</div>;

  const currentRoom = appState.rooms[appState.currentRoomIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] text-gray-900 pb-20 font-sans">
      {processing && (
          <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center text-white">
              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
              <p className="text-xl font-medium">{loadingText}</p>
          </div>
      )}
      
      {/* MAGNIFICATION MODAL */}
      {previewImage && (
          <div 
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 animate-fade-in"
              onClick={() => setPreviewImage(null)}
          >
              <div className="relative max-w-full max-h-full">
                  <img src={previewImage} className="max-w-full max-h-[90vh] rounded shadow-2xl object-contain" alt="Preview" />
                  <button 
                      onClick={() => setPreviewImage(null)}
                      className="absolute -top-12 right-0 text-white hover:text-gray-300 bg-white/10 rounded-full p-2"
                  >
                      <span className="material-icons text-3xl">close</span>
                  </button>
                  <div className="text-center text-white/50 text-sm mt-2">Click anywhere to close</div>
              </div>
          </div>
      )}

      {/* EDIT MODAL */}
      {editingAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                  <div className="p-4 border-b flex justify-between items-center bg-indigo-50 rounded-t-xl">
                      <h3 className="text-lg font-bold text-indigo-800 flex items-center gap-2">
                          <span className="material-icons">edit</span> Edit Asset
                      </h3>
                      <button onClick={() => setEditingAsset(null)} className="text-gray-500 hover:text-gray-700">
                          <span className="material-icons">close</span>
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      {/* --- GOVERNANCE LOG (NEW) --- */}
                      <div className="bg-slate-50 border rounded-lg p-3 text-xs text-gray-500 max-h-24 overflow-y-auto mb-4">
                        <strong className="block mb-1 text-slate-700">Governance & Audit History:</strong>
                        <ul className="space-y-1">
                          {(editingAsset.auditTrail || []).map((log, i) => (
                             <li key={i} className="flex gap-2">
                               <span className="font-mono text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                               <span className={`font-bold ${log.actor === 'AI' ? 'text-purple-600' : 'text-blue-600'}`}>[{log.actor}]</span>
                               <span>{log.action}: {log.details}</span>
                             </li>
                          ))}
                          {(!editingAsset.auditTrail || editingAsset.auditTrail.length === 0) && <li>No history recorded.</li>}
                        </ul>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Category</label>
                          <select 
                              value={editingAsset.category}
                              onChange={(e) => setEditingAsset({...editingAsset, category: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                          >
                              {/* Ensure the current value is always an option even if somehow missing from list */}
                              {!ASSET_CATEGORIES.includes(editingAsset.category) && <option value={editingAsset.category}>{editingAsset.category}</option>}
                              <option value="">Select Category...</option>
                              {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description</label>
                          <textarea 
                              value={editingAsset.description}
                              onChange={(e) => setEditingAsset({...editingAsset, description: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-24"
                              placeholder="Detailed description..."
                          />
                      </div>

                      <div className="grid grid-cols-4 gap-4">
                          <div className="col-span-1">
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Condition</label>
                              <select 
                                  value={editingAsset.condition}
                                  onChange={(e) => setEditingAsset({...editingAsset, condition: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                              >
                                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                          </div>
                          <div className="col-span-1">
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Risk Rating</label>
                              <select 
                                  value={editingAsset.riskRating || 'Low'}
                                  onChange={(e) => setEditingAsset({...editingAsset, riskRating: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                              >
                                  {RISK_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                          </div>
                          <div className="col-span-1">
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Age (Yrs)</label>
                              <input 
                                  type="text"
                                  value={editingAsset.age || ''}
                                  onChange={(e) => setEditingAsset({...editingAsset, age: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                                  placeholder="e.g. 15"
                              />
                          </div>
                          <div className="col-span-1">
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Quantity</label>
                              <input 
                                  type="text"
                                  value={editingAsset.quantity}
                                  onChange={(e) => setEditingAsset({...editingAsset, quantity: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Justification</label>
                          <textarea 
                              value={editingAsset.justification}
                              onChange={(e) => setEditingAsset({...editingAsset, justification: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-20"
                              placeholder="Why is it in this condition?"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Notes (Inspector Observations)</label>
                          <textarea 
                              value={editingAsset.notes || ''}
                              onChange={(e) => setEditingAsset({...editingAsset, notes: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-20 bg-yellow-50"
                              placeholder="Add any additional notes or recommendations..."
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Cost ($)</label>
                              <input 
                                  type="text"
                                  value={editingAsset.cost}
                                  onChange={(e) => setEditingAsset({...editingAsset, cost: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">RUL (Years)</label>
                              <input 
                                  type="text"
                                  value={editingAsset.rul}
                                  onChange={(e) => setEditingAsset({...editingAsset, rul: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                          </div>
                      </div>
                  </div>
                  <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-2">
                      <button 
                          onClick={() => setEditingAsset(null)}
                          className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={saveEditedAsset}
                          className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md transform active:scale-95 transition"
                      >
                          Save Changes
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="max-w-7xl mx-auto p-4 md:p-6 min-h-screen flex flex-col">
          <header className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-4 mb-6 flex flex-wrap justify-between items-center gap-4">
              <div>
                  <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-2">
                    <span className="material-icons text-indigo-600">domain</span>
                    Building Asset Inspector
                  </h1>
                  <p className="text-xs text-gray-500">ISO 55001:2024 Compliant</p>
              </div>
              <div className="flex gap-2 items-center">
                  {/* Portfolio Toggle */}
                  {viewMode === 'single' ? (
                      <button onClick={loadPortfolio} className="bg-purple-100 text-purple-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-purple-200 transition flex items-center gap-1">
                          <span className="material-icons text-sm">dashboard</span> Portfolio View
                      </button>
                  ) : (
                      <button onClick={() => setViewMode('single')} className="bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-200 transition flex items-center gap-1">
                          <span className="material-icons text-sm">edit_note</span> Single Inspection
                      </button>
                  )}

                  <div className="flex items-center gap-2 mr-2">
                      <span className={`text-xs font-bold ${appState.privacyMode ? 'text-green-600' : 'text-gray-500'}`}>
                          {appState.privacyMode ? 'Privacy ON' : 'Privacy OFF'}
                      </span>
                      <button 
                          onClick={togglePrivacyMode}
                          className={`w-10 h-5 rounded-full p-1 transition-colors ${appState.privacyMode ? 'bg-green-500' : 'bg-gray-300'}`}
                          title="Toggle Privacy Mode"
                      >
                          <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${appState.privacyMode ? 'translate-x-5' : 'translate-x-0'}`}></div>
                      </button>
                  </div>
                  <div className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-xs font-medium border border-green-100">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Cloud
                  </div>
              </div>
          </header>

          {/* PORTFOLIO DASHBOARD VIEW */}
          {viewMode === 'portfolio' ? (
              <div className="flex-1 p-4 animate-fade-in">
                  <div className="bg-white rounded-2xl shadow-xl p-8 w-full mb-6">
                      <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                          <span className="material-icons text-purple-600">pie_chart</span> 
                          Portfolio Intelligence
                      </h2>
                      <p className="text-gray-600 mb-6">
                          Analyzing <strong>{portfolioData.length}</strong> buildings in your database. 
                          Ask the Engineering Manager below to identify cross-portfolio risks.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {portfolioData.map((site, idx) => (
                              <div key={idx} className="border rounded-xl p-4 hover:shadow-md transition bg-gray-50">
                                  <h3 className="font-bold text-lg text-indigo-700">{site.siteInfo?.name || 'Unknown Site'}</h3>
                                  <p className="text-xs text-gray-500 mb-3">{site.siteInfo?.address}</p>
                                  <div className="text-sm">
                                      <div className="flex justify-between mb-1">
                                          <span>Rooms:</span>
                                          <span className="font-bold">{site.rooms?.length || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                          <span>Last Update:</span>
                                          <span className="text-gray-500">{new Date(site.lastUpdated).toLocaleDateString()}</span>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          ) : (
              // SINGLE INSPECTION VIEW (Original UI)
              <>
                  {appState.view === 'welcome' && (
                      <div className="flex-1 flex items-center justify-center p-4">
                          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full transform transition-all animate-fade-in-up">
                              <div className="text-center mb-8">
                                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                                      <span className="material-icons text-4xl">assignment</span>
                                  </div>
                                  <h2 className="text-2xl font-bold text-gray-800">Site Information</h2>
                              </div>
                              <div className="space-y-4">
                                  <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Site / Building Name *</label>
                                      <input 
                                          className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500"
                                          placeholder="e.g. Dubbo Civic Centre"
                                          value={appState.siteInfo.name}
                                          onChange={(e) => handleSiteInfoChange('name', e.target.value)}
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Site Address *</label>
                                      <div className="flex gap-2">
                                          <input 
                                              className="flex-1 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500"
                                              placeholder="e.g. 123 Main St"
                                              value={appState.siteInfo.address}
                                              onChange={(e) => handleSiteInfoChange('address', e.target.value)}
                                          />
                                          <button 
                                              onClick={detectLocation}
                                              className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 flex items-center gap-1"
                                              title="Detect Location"
                                          >
                                              <span className="material-icons">my_location</span>
                                          </button>
                                      </div>
                                  </div>
                                  <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Number of Rooms</label>
                                      <input 
                                          type="number"
                                          className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500"
                                          value={appState.siteInfo.numRooms}
                                          onChange={(e) => handleSiteInfoChange('numRooms', parseInt(e.target.value))}
                                      />
                                  </div>

                                  <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
                                      <span className="material-icons text-blue-600 mt-1">security</span>
                                      <div className="text-xs text-blue-800">
                                          <strong>Privacy Note:</strong> Turn on "Privacy Mode" in the top right to anonymize site data sent to AI.
                                      </div>
                                  </div>

                                  <button 
                                      onClick={startAssessment}
                                      disabled={!appState.siteInfo.name || !appState.siteInfo.address}
                                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transform active:scale-95 transition-all mt-6 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                      <span className="material-icons">play_circle</span> START ASSESSMENT
                                  </button>
                                  
                                  <button onClick={loadDemo} className="w-full text-indigo-600 text-sm font-medium hover:underline">
                                      Load Demo Data
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}

                  {appState.view === 'assessment' && currentRoom && (
                      <div className="space-y-6 animate-fade-in pb-24">
                          <div className="flex justify-between items-center text-white mb-2">
                              <button onClick={goToPrevPage} className="flex items-center gap-1 hover:text-indigo-200 transition">
                                  <span className="material-icons">arrow_back</span> Prev
                              </button>
                              <div className="text-center">
                                  <span className="font-bold text-lg">Page {appState.currentRoomIndex + 1} of {appState.rooms.length}</span>
                              </div>
                              <button onClick={goToNextPage} className="flex items-center gap-1 hover:text-indigo-200 transition">
                                  {appState.currentRoomIndex === appState.rooms.length - 1 ? 'Finish' : 'Next'} <span className="material-icons">arrow_forward</span>
                              </button>
                          </div>

                          <div className="bg-white rounded-xl shadow-md p-6">
                              <div className="flex items-center gap-2 mb-4 text-indigo-600">
                                  <span className="material-icons">door_front</span>
                                  <h3 className="font-bold">Room Information</h3>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <input 
                                      value={currentRoom.buildingName} 
                                      onChange={(e) => updateCurrentRoom({ buildingName: e.target.value })}
                                      placeholder="Building Name"
                                      className="px-4 py-2 border rounded-lg bg-gray-50 text-black placeholder-gray-500"
                                  />
                                  <input 
                                      value={currentRoom.roomName} 
                                      onChange={(e) => updateCurrentRoom({ roomName: e.target.value })}
                                      placeholder="Room Name"
                                      className="px-4 py-2 border rounded-lg bg-gray-50 text-black placeholder-gray-500"
                                  />
                              </div>
                          </div>

                          <div className="bg-white rounded-xl shadow-md p-6">
                              <div className="flex justify-between items-center mb-4">
                                  <div className="flex items-center gap-2 text-indigo-600">
                                      <span className="material-icons">photo_camera</span>
                                      <h3 className="font-bold">Capture Images</h3>
                                  </div>
                                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">{currentRoom.images.length} / 5</span>
                              </div>
                              <div className="flex gap-4 overflow-x-auto pb-2">
                                  {currentRoom.images.map(img => (
                                      <div key={img.id} className="relative w-32 h-32 flex-shrink-0">
                                          <img src={img.dataUrl} className="w-full h-full object-cover rounded-lg shadow-sm border" alt="Room" />
                                          <button 
                                              onClick={() => updateCurrentRoom({ images: currentRoom.images.filter(i => i.id !== img.id) })}
                                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition"
                                          >
                                              <span className="material-icons text-xs">close</span>
                                          </button>
                                      </div>
                                  ))}
                                  <label className="w-32 h-32 flex-shrink-0 border-2 border-dashed border-indigo-300 rounded-lg flex flex-col items-center justify-center text-indigo-500 hover:bg-indigo-50 cursor-pointer transition">
                                      <span className="material-icons text-3xl">add_a_photo</span>
                                      <span className="text-xs mt-1">Add Photo</span>
                                      <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                                  </label>
                              </div>
                              <div className="mt-6 flex justify-center">
                                  <button 
                                      onClick={generateAssetsWithAI}
                                      disabled={currentRoom.images.length === 0 || processing}
                                      className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-full shadow-lg flex items-center gap-2 transition transform hover:scale-105 disabled:opacity-50 disabled:transform-none"
                                  >
                                      <span className="material-icons">auto_awesome</span> Generate Asset List
                                  </button>
                              </div>
                          </div>

                          <div className="bg-white rounded-xl shadow-md overflow-hidden">
                              <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                                  <div className="flex items-center gap-2 text-indigo-600">
                                      <span className="material-icons">table_chart</span>
                                      <h3 className="font-bold">Detected Assets</h3>
                                      {/* Verification Stats Summary */}
                                      <div className="flex gap-4 items-center ml-4 bg-gray-100 px-3 py-1 rounded-full">
                                        <span className="text-xs">
                                            <span className="font-bold text-green-600">{currentRoom.assets.filter(a => a.verified).length}</span>
                                            <span className="text-gray-500">/{currentRoom.assets.length} Verified</span>
                                        </span>
                                        <span className="text-xs text-blue-600 font-medium pl-2 border-l border-gray-300">
                                            {currentRoom.assets.filter(a => a.aiDetected && !a.verified).length} AI Pending
                                        </span>
                                      </div>
                                  </div>
                                  <div className="flex gap-2">
                                      {batchMode && (
                                          <>
                                              <button onClick={() => batchAction('verify')} className="bg-green-100 text-green-700 px-3 py-1 rounded text-xs font-bold hover:bg-green-200">Verify Selected</button>
                                              <button onClick={() => batchAction('delete')} className="bg-red-100 text-red-700 px-3 py-1 rounded text-xs font-bold hover:bg-red-200">Delete Selected</button>
                                          </>
                                      )}
                                      <button 
                                          onClick={toggleBatchMode} 
                                          className={`px-3 py-1 rounded text-xs font-bold border ${batchMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'}`}
                                      >
                                          {batchMode ? 'Done' : 'Batch Mode'}
                                      </button>
                                  </div>
                              </div>
                              <div className="overflow-x-auto">
                                  <table className="w-full text-sm text-left">
                                      <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                          <tr>
                                              {batchMode && <th className="px-4 py-3 w-8"></th>}
                                              <th className="px-4 py-3 w-16">Image</th>
                                              <th className="px-4 py-3 w-48">Category</th>
                                              <th className="px-4 py-3 w-64">Description</th>
                                              <th className="px-4 py-3 w-28">Condition</th>
                                              <th className="px-4 py-3 w-20">Risk</th>
                                              <th className="px-4 py-3 w-16">Age</th>
                                              <th className="px-4 py-3 w-64">Justification</th>
                                              <th className="px-4 py-3 w-48">Notes</th>
                                              <th className="px-4 py-3 w-16">Qty</th>
                                              <th className="px-4 py-3 w-24">Cost ($)</th>
                                              <th className="px-4 py-3 w-20">RUL (yr)</th>
                                              <th className="px-4 py-3 w-12 text-center">AI</th>
                                              <th className="px-4 py-3 w-16 text-center">Human ✓</th>
                                              <th className="px-4 py-3 w-12 text-center">Edit</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                          {currentRoom.assets.length === 0 ? (
                                              <tr><td colSpan={15} className="px-4 py-8 text-center text-gray-400">No assets detected yet. Upload images and generate.</td></tr>
                                          ) : (
                                              currentRoom.assets.map(asset => (
                                                  <tr key={asset.id} className={`hover:bg-gray-50 group ${asset.verified ? 'bg-green-50' : ''}`}>
                                                      {batchMode && (
                                                          <td className="px-4 py-3">
                                                              <input 
                                                                  type="checkbox" 
                                                                  checked={selectedAssetIds.has(asset.id)}
                                                                  onChange={() => toggleAssetSelection(asset.id)}
                                                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                                              />
                                                          </td>
                                                      )}
                                                      <td className="px-4 py-3">
                                                          {currentRoom.croppedImages[asset.id] ? (
                                                              <img 
                                                                  src={currentRoom.croppedImages[asset.id]} 
                                                                  className="w-12 h-12 object-contain border rounded bg-gray-100 cursor-zoom-in hover:opacity-80 transition" 
                                                                  alt="Asset"
                                                                  onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setPreviewImage(currentRoom.croppedImages[asset.id]);
                                                                  }}
                                                                  title="Click to magnify"
                                                              />
                                                          ) : (
                                                              <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                                                                  <span className="material-icons text-sm">image_not_supported</span>
                                                              </div>
                                                          )}
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <select 
                                                              value={asset.category}
                                                              onChange={(e) => updateAsset(asset.id, 'category', e.target.value)}
                                                              className="bg-transparent border-none focus:ring-0 w-full p-0 text-sm font-medium text-gray-900"
                                                          >
                                                              {/* Fallback option if AI returns something not in list (unlikely with Schema) */}
                                                              {!ASSET_CATEGORIES.includes(asset.category) && <option value={asset.category}>{asset.category}</option>}
                                                              {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                          </select>
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <textarea 
                                                              value={asset.description}
                                                              onChange={(e) => updateAsset(asset.id, 'description', e.target.value)}
                                                              className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none text-gray-600"
                                                              rows={2}
                                                          />
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <select
                                                              value={asset.condition}
                                                              onChange={(e) => updateAsset(asset.id, 'condition', e.target.value)}
                                                              className={`rounded px-2 py-1 text-xs font-bold ${
                                                                  asset.condition === 'Good' || asset.condition === 'Excellent' ? 'bg-green-100 text-green-800' :
                                                                  asset.condition === 'Fair' ? 'bg-yellow-100 text-yellow-800' :
                                                                  'bg-red-100 text-red-800'
                                                              }`}
                                                          >
                                                              {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                                          </select>
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <select
                                                              value={asset.riskRating || 'Low'}
                                                              onChange={(e) => updateAsset(asset.id, 'riskRating', e.target.value)}
                                                              className={`rounded px-2 py-1 text-xs font-bold border-0 ${
                                                                  asset.riskRating === 'Extreme' ? 'bg-red-600 text-white' :
                                                                  asset.riskRating === 'High' ? 'bg-orange-500 text-white' :
                                                                  asset.riskRating === 'Medium' ? 'bg-yellow-400 text-yellow-900' :
                                                                  'bg-green-100 text-green-800'
                                                              }`}
                                                          >
                                                              {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                                          </select>
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <input 
                                                              type="text"
                                                              value={asset.age || ''}
                                                              onChange={(e) => updateAsset(asset.id, 'age', e.target.value)}
                                                              className="w-12 bg-transparent text-center border-b border-transparent focus:border-indigo-500 focus:outline-none text-xs"
                                                              placeholder="-"
                                                          />
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <textarea 
                                                              value={asset.justification}
                                                              onChange={(e) => updateAsset(asset.id, 'justification', e.target.value)}
                                                              className="w-full bg-transparent border-none focus:ring-0 p-0 text-xs text-gray-500 resize-none italic"
                                                              placeholder="No justification"
                                                              rows={2}
                                                          />
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <textarea 
                                                              value={asset.notes || ''}
                                                              onChange={(e) => updateAsset(asset.id, 'notes', e.target.value)}
                                                              className="w-full bg-transparent border-none focus:ring-0 p-0 text-xs text-gray-600 resize-none italic bg-yellow-50 rounded px-1"
                                                              placeholder="Add notes..."
                                                              rows={2}
                                                          />
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <input 
                                                              type="text"
                                                              value={asset.quantity}
                                                              onChange={(e) => updateAsset(asset.id, 'quantity', e.target.value)}
                                                              className="w-12 bg-transparent text-center border-b border-transparent focus:border-indigo-500 focus:outline-none"
                                                          />
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <input 
                                                              value={asset.cost}
                                                              onChange={(e) => updateAsset(asset.id, 'cost', e.target.value)}
                                                              className="w-20 bg-transparent text-right border-b border-transparent focus:border-indigo-500 focus:outline-none"
                                                          />
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <input 
                                                              value={asset.rul}
                                                              onChange={(e) => updateAsset(asset.id, 'rul', e.target.value)}
                                                              className="w-12 bg-transparent text-center border-b border-transparent focus:border-indigo-500 focus:outline-none"
                                                          />
                                                      </td>
                                                      
                                                      {/* AI Verified Badge */}
                                                      <td className="px-2 py-3 text-center">
                                                          {asset.aiDetected && (
                                                              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">AI</span>
                                                          )}
                                                      </td>

                                                      {/* Human Verified Toggle */}
                                                      <td className="px-2 py-3 text-center">
                                                          <button 
                                                              onClick={() => updateAsset(asset.id, 'verified', !asset.verified)}
                                                              className={`rounded-full p-1 transition ${asset.verified ? 'bg-green-500 text-white' : 'text-gray-300 hover:bg-gray-100'}`}
                                                              title="Toggle Verification"
                                                          >
                                                              <span className="material-icons text-sm">{asset.verified ? 'check' : 'radio_button_unchecked'}</span>
                                                          </button>
                                                      </td>

                                                      <td className="px-4 py-3 text-center">
                                                        <button 
                                                            onClick={() => setEditingAsset(asset)}
                                                            className="rounded-full p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                                            title="Edit Asset"
                                                        >
                                                            <span className="material-icons text-lg">edit</span>
                                                        </button>
                                                      </td>
                                                  </tr>
                                              ))
                                          )}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      </div>
                  )}

                  {appState.view === 'summary' && (
                      <div className="flex-1 p-4 flex items-center justify-center">
                          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full animate-fade-in-up">
                              <div className="text-center mb-8">
                                  <h2 className="text-3xl font-bold text-gray-800 mb-2">Assessment Complete!</h2>
                                  <p className="text-gray-500">Your data has been saved locally. Review the Site Notes and Export.</p>
                              </div>

                              {/* NEW SITE NOTES SECTION */}
                              <div className="mb-8">
                                  <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                      <span className="material-icons text-indigo-600">assignment</span>
                                      Site Notes / Executive Summary
                                  </label>
                                  <textarea 
                                      className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500 h-40 text-sm leading-relaxed"
                                      placeholder="General observations, executive summary, or key recommendations..."
                                      value={appState.siteInfo.notes}
                                      onChange={(e) => handleSiteInfoChange('notes', e.target.value)}
                                      onBlur={saveGlobalState}
                                  />
                                  <p className="text-xs text-gray-500 mt-1 italic">
                                      * This section is automatically populated with a summary of your conversation with the AI Engineering Manager.
                                  </p>
                              </div>

                              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8">
                                  <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                                      <span className="material-icons text-sm">info</span> Export Options
                                  </h4>
                                  <ul className="text-sm text-blue-700 space-y-1">
                                      <li>• <strong>Excel:</strong> Complete dataset + Site Notes.</li>
                                      <li>• <strong>PDF:</strong> Professional report + Executive Summary.</li>
                                      <li>• <strong>RAG JSON:</strong> Structured data for AI Knowledge Bases.</li>
                                  </ul>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                  <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-3xl">description</span>
                                      <span className="font-bold">Export Excel</span>
                                  </button>
                                  <button onClick={exportToPDF} className="bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-3xl">picture_as_pdf</span>
                                      <span className="font-bold">Export PDF</span>
                                  </button>
                                  <button onClick={exportForRAG} className="bg-sky-600 hover:bg-sky-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-3xl">hub</span>
                                      <span className="font-bold">Export RAG</span>
                                  </button>
                              </div>

                              <div className="flex flex-col gap-3">
                                  <button onClick={() => setAppState(prev => ({ ...prev, view: 'assessment', currentRoomIndex: 0 }))} className="text-indigo-600 font-medium hover:underline">
                                      Return to Review
                                  </button>
                                  <button onClick={handleReset} className="text-red-400 text-sm hover:text-red-600">
                                      Start New Assessment (Clear Data)
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}
              </>
          )}
      </div>

      {/* Persistent Chatbot */}
      {/* If in portfolio mode, pass entire portfolio. Else pass single site context. */}
      {appState.view !== 'welcome' && (
          <ChatBot 
              contextData={viewMode === 'portfolio' ? portfolioData : { siteInfo: appState.siteInfo, rooms: appState.rooms }} 
              mode={viewMode}
              privacyMode={appState.privacyMode} 
              messages={chatMessages}
              setMessages={setChatMessages}
          />
      )}
    </div>
  );
}

export default App;
