
import React, { useState, useEffect, useMemo } from 'react';
import { SiteInfo, Room, AppState, Asset, ChatMessage, AuditEntry } from './types';
import { firebaseService } from './services/firebaseService';
import { detectAssetsWithBoundingBoxes, cropImage, summarizeConversation, analyzeDocument, extractAssetsFromVendorRegister } from './services/geminiService';
import { ChatBot } from './components/ChatBot';
import { format, subMonths, startOfMonth, eachMonthOfInterval, isSameMonth, parseISO } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

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
const RISK_COLORS: Record<string, string> = {
  Low: '#10B981',       // Green
  Medium: '#EAB308',    // Yellow
  High: '#F97316',      // Orange
  Extreme: '#DC2626'    // Red
};

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // Manual override for testing offline mode UI
  const [simulateOffline, setSimulateOffline] = useState(false);
  const effectiveIsOnline = isOnline && !simulateOffline;
  const [syncingOfflineData, setSyncingOfflineData] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [selectedMapSiteId, setSelectedMapSiteId] = useState<string>('colombo_port_warehouse_b');
  const [mapLayerType, setMapLayerType] = useState<'streets' | 'satellite' | 'cadastral'>('satellite');
  
  // NEW: Address Autocomplete & Geocoding States
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  
  // NEW: Portfolio Data State
  const [portfolioData, setPortfolioData] = useState<any[]>([]);
  const [portfolioSearch, setPortfolioSearch] = useState('');
  const [portfolioStatusFilter, setPortfolioStatusFilter] = useState('All');
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
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // NEW: Automatic Background Queue Sync Side-Effect
  useEffect(() => {
    const checkAndSync = async () => {
        try {
            const count = await firebaseService.getPendingQueueCount();
            setPendingQueueCount(count);
            
            if (effectiveIsOnline && count > 0 && !syncingOfflineData) {
                setSyncingOfflineData(true);
                setSyncMessage(`Processing ${count} offline updates...`);
                
                const syncedCount = await firebaseService.syncPendingQueue((progText) => {
                    setSyncMessage(progText);
                });
                
                if (syncedCount > 0) {
                    const freshPortfolio = await firebaseService.getAllInspections();
                    setPortfolioData(freshPortfolio);
                    setSyncMessage(`Successfully synchronized ${syncedCount} offline inspections!`);
                    setTimeout(() => setSyncMessage(''), 3500);
                } else {
                    // Check if items are held up by persistent permissions/authorization errors
                    const errors = await firebaseService.getPendingQueueErrors();
                    const hasPermissionError = errors.some(err => 
                        err.toLowerCase().includes("permission") || 
                        err.toLowerCase().includes("unauthorized") || 
                        err.toUpperCase().includes("PERMISSION_DENIED")
                    );
                    if (hasPermissionError) {
                        setSyncMessage("Sync paused: Authorization required. Drafts are safely cached locally in IndexedDB.");
                    } else {
                        setSyncMessage('');
                    }
                }
            }
        } catch (err) {
            console.error("Auto background synchronization error:", err);
            setSyncMessage('Auto sync failed. Retrying.');
            setTimeout(() => setSyncMessage(''), 3500);
        } finally {
            setSyncingOfflineData(false);
            const finalCount = await firebaseService.getPendingQueueCount();
            setPendingQueueCount(finalCount);
        }
    };

    checkAndSync();
    
    // Polling triggers to keep status counts extremely fresh
    const syncCheckerTimer = setInterval(checkAndSync, 8000);
    return () => clearInterval(syncCheckerTimer);
  }, [effectiveIsOnline]);

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
  const handleSync = async () => {
    setSyncingOfflineData(true);
    try {
        await firebaseService.saveState(appState.siteInfo, appState.rooms);
        await new Promise(resolve => setTimeout(resolve, 800)); // UI feedback
    } catch (e) {
        console.error("Sync failed:", e);
    } finally {
        setSyncingOfflineData(false);
    }
  };

  const loadPortfolio = async () => {
      setLoading(true);
      const data = await firebaseService.getAllInspections();
      setPortfolioData(data);
      setViewMode('portfolio');
      setLoading(false);
  };

  const openInspection = (inspection: any) => {
      setAppState(prev => ({
          ...prev,
          siteInfo: inspection.siteInfo || { name: 'Unknown Site', address: '', numRooms: 5, notes: '' },
          rooms: inspection.rooms || [],
          view: 'assessment',
          currentRoomIndex: 0
      }));
      setViewMode('single');
  };

  const filteredPortfolio = portfolioData.filter(site => {
      const matchesSearch = (site.siteInfo?.name || '').toLowerCase().includes(portfolioSearch.toLowerCase()) || 
                            (site.siteInfo?.address || '').toLowerCase().includes(portfolioSearch.toLowerCase());
      if (portfolioStatusFilter === 'All') return matchesSearch;
      
      const isComplete = site.rooms?.every((r: any) => r.assets?.length > 0); 
      // simple logic: if all rooms have assets => complete, else progress
      if (portfolioStatusFilter === 'Complete') return matchesSearch && isComplete;
      if (portfolioStatusFilter === 'In Progress') return matchesSearch && !isComplete;
      return matchesSearch;
  });

  // --- State Updates & Helpers ---

  const handleSiteInfoChange = (field: keyof SiteInfo, value: any) => {
    setAppState(prev => ({
      ...prev,
      siteInfo: { ...prev.siteInfo, [field]: value }
    }));
  };

  const handleAddressInputChange = async (value: string) => {
    handleSiteInfoChange('address', value);
    setAddressError(null);

    if (!value || value.trim().length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearchingAddress(true);
    try {
      const response = await fetch(
        `https://photon.komoot.io/api?q=${encodeURIComponent(value)}&limit=5`
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.features) {
          const suggestions = data.features.map((feat: any) => {
            const props = feat.properties;
            const geom = feat.geometry;
            const parts = [
              props.name,
              props.street,
              props.city || props.town,
              props.state,
              props.country
            ].filter(Boolean);
            const label = [...new Set(parts)].join(', ');
            return {
              label: label || props.name || 'Unnamed Locality',
              latitude: geom.coordinates[1],
              longitude: geom.coordinates[0],
              raw: feat
            };
          }).filter((s: any) => s.label);
          
          setAddressSuggestions(suggestions);
          setShowSuggestions(suggestions.length > 0);
        } else {
          setAddressSuggestions([]);
          setShowSuggestions(false);
        }
      }
    } catch (err) {
      console.warn("Geocoding fetch failed:", err);
    } finally {
      setIsSearchingAddress(false);
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    setAppState(prev => ({
      ...prev,
      siteInfo: {
        ...prev.siteInfo,
        address: suggestion.label,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude
      }
    }));
    setAddressSuggestions([]);
    setShowSuggestions(false);
  };

  const saveGlobalState = () => {
    firebaseService.saveState(appState.siteInfo, appState.rooms);
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setProcessing(true);
      setLoadingText(`Analyzing ${file.name}...`);

      try {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = async () => {
              const dataUrl = reader.result as string;
              
              if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                  const summary = await analyzeDocument(dataUrl, file.type, file.name);
                  
                  const newDoc = {
                      id: crypto.randomUUID(),
                      name: file.name,
                      summary,
                      dateAdded: Date.now()
                  };
                  
                  setAppState(prev => ({
                      ...prev,
                      siteInfo: {
                          ...prev.siteInfo,
                          documents: [...(prev.siteInfo.documents || []), newDoc]
                      }
                  }));
              } else {
                  alert("Unsupported file type. Please upload PDF or image.");
              }
              setProcessing(false);
          };
      } catch (err) {
          console.error(err);
          setProcessing(false);
      }
  };

  const handleVendorRegisterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setProcessing(true);
      setLoadingText(`Extracting assets from ${file.name}...`);

      try {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = async () => {
              const dataUrl = reader.result as string;
              
              const groupedAssets = await extractAssetsFromVendorRegister(dataUrl, file.type, file.name);
              
              if (groupedAssets.length > 0) {
                  let newRooms = [...appState.rooms];
                  
                  groupedAssets.forEach(group => {
                      let room = newRooms.find(r => r.roomName.toLowerCase() === group.roomName.toLowerCase());
                      if (!room) {
                          room = {
                              ...INITIAL_ROOM_STATE,
                              id: crypto.randomUUID(),
                              roomName: group.roomName,
                              buildingName: appState.siteInfo.name || 'Building'
                          };
                          newRooms.push(room);
                      }
                      
                      const mappedAssets: Asset[] = group.assets.map(a => ({
                          id: crypto.randomUUID(),
                          name: a.description?.substring(0, 30) || 'Unknown Asset',
                          category: a.category || 'Other',
                          description: a.description || 'Unknown Asset',
                          condition: a.condition || 'Unknown',
                          riskRating: a.riskRating || 'Low',
                          auditTrail: [],
                          justification: a.justification || 'Imported from vendor register',
                          quantity: a.quantity || 1,
                          cost: a.cost || '0',
                          age: a.age || 'Unknown',
                          rul: a.rul || 'Unknown',
                          verified: true, // Auto-verify imported data or leave unverified? Let's say verified:false so user must check
                          aiDetected: true
                      }));
                      
                      room.assets = [...room.assets, ...mappedAssets];
                  });
                  
                  setAppState(prev => ({
                      ...prev,
                      rooms: newRooms,
                      siteInfo: {
                          ...prev.siteInfo,
                          numRooms: newRooms.length
                      }
                  }));
                  alert(`Successfully imported ${groupedAssets.reduce((acc, g) => acc + g.assets.length, 0)} assets across ${groupedAssets.length} areas.`);
              } else {
                  alert("Could not extract any assets from this file. Ensure it is a valid format.");
              }
              setProcessing(false);
          };
      } catch (err) {
          console.error(err);
          setProcessing(false);
          alert("Failed to parse the file.");
      }
  };

  const startAssessment = async () => {
    let lat = appState.siteInfo.latitude;
    let lng = appState.siteInfo.longitude;

    if (appState.siteInfo.address && (lat === undefined || lng === undefined)) {
      setLoadingText("Resolving site address coordinates...");
      setProcessing(true);
      try {
        const response = await fetch(
          `https://photon.komoot.io/api?q=${encodeURIComponent(appState.siteInfo.address)}&limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          if (data && data.features && data.features.length > 0) {
            const geom = data.features[0].geometry;
            lat = geom.coordinates[1];
            lng = geom.coordinates[0];
          }
        }
      } catch (err) {
        console.warn("Background geocoding on submit failed", err);
      } finally {
        setProcessing(false);
        setLoadingText("");
      }
    }

    const updatedSiteInfo = {
      ...appState.siteInfo,
      latitude: lat,
      longitude: lng
    };

    if (appState.rooms && appState.rooms.length > 0) {
        setAppState(prev => ({
            ...prev,
            siteInfo: updatedSiteInfo,
            view: 'assessment',
            currentRoomIndex: 0
        }));
        firebaseService.saveState(updatedSiteInfo, appState.rooms);
        return;
    }

    const newRooms = Array.from({ length: appState.siteInfo.numRooms }).map((_, i) => ({
      ...INITIAL_ROOM_STATE,
      id: crypto.randomUUID(),
      roomName: i === 0 ? 'Building Exterior' : `Room ${i}`,
      buildingName: appState.siteInfo.name
    }));
    
    setAppState(prev => ({
      ...prev,
      siteInfo: updatedSiteInfo,
      rooms: newRooms,
      view: 'assessment',
      currentRoomIndex: 0
    }));
    firebaseService.saveState(updatedSiteInfo, newRooms);
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
          const newAsset = {
              ...a, 
              [field]: value,
              auditTrail: [...(a.auditTrail || []), log]
          };
          if (field === 'riskRating' && a.riskRating !== value) {
              const riskLog: import("./types").RiskHistoryEntry = {
                  timestamp: Date.now(),
                  actor: 'USER',
                  previousRisk: a.riskRating,
                  newRisk: value
              };
              newAsset.riskHistory = [...(a.riskHistory || []), riskLog];
          }
          return newAsset;
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
            
            let riskHistory = [...(a.riskHistory || [])];
            if(a.riskRating !== editingAsset.riskRating) {
                changes.push(`Risk: ${a.riskRating} -> ${editingAsset.riskRating}`);
                riskHistory.push({
                    timestamp: Date.now(),
                    actor: 'USER',
                    previousRisk: a.riskRating,
                    newRisk: editingAsset.riskRating || 'Low' // Default to Low if missing
                });
            }
            
            let newTrail = [...(a.auditTrail || [])];
            if (changes.length > 0) {
                 newTrail.push(createAuditEntry('BULK_EDIT', changes.join(', ')));
            } else {
                 newTrail.push(createAuditEntry('EDIT', 'Updated asset details'));
            }

            return { ...editingAsset, auditTrail: newTrail, riskHistory };
        }
        return a;
      });
      updateCurrentRoom({ assets: updatedAssets });
      setEditingAsset(null);
  };

  const isBuildingFabric = (category: string) => category.startsWith("Building Structural & Fabric");

  const detectLocation = () => {
    setAddressError(null);
    if (!navigator.geolocation) {
      setAddressError("Geolocation is not supported by your browser. Please type your address manually below.");
      return;
    }
    
    setLoadingText("Detecting location...");
    setProcessing(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let addressFound = false;
        let finalAddress = "";

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
                    const uniqueParts = [...new Set(parts)];
                    finalAddress = uniqueParts.join(', ');
                    addressFound = true;
                }
            }
          }
        } catch (e) {
          console.warn("Geocoding failed", e);
        }

        if (!addressFound) {
            finalAddress = `Lat: ${latitude.toFixed(5)}, Long: ${longitude.toFixed(5)}`;
        }

        setAppState(prev => ({
          ...prev,
          siteInfo: {
            ...prev.siteInfo,
            address: finalAddress,
            latitude,
            longitude
          }
        }));

        setProcessing(false);
        setLoadingText("");
      },
      (error) => {
        console.error("Geolocation error", error);
        let msg = "Location error.";
        if (error.code === 1) msg = "Location permission denied. Please allow location access or type your address manually.";
        else if (error.code === 2) msg = "Location unavailable. Please type your address manually.";
        else if (error.code === 3) msg = "Location request timed out. Please type your address manually.";
        
        setAddressError(`${msg} (Details: ${error.message || 'Unknown'})`);
        
        setProcessing(false);
        setLoadingText("");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const togglePrivacyMode = () => {
      setAppState(prev => ({ ...prev, privacyMode: !prev.privacyMode }));
  };

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
      const detectedAssets = await detectAssetsWithBoundingBoxes(currentRoom.images, ASSET_CATEGORIES, appState.privacyMode, currentRoom.assets);
      
      setLoadingText('Cropping asset images...');
      const newCroppedImages = { ...currentRoom.croppedImages };
      
      let finalAssets = [...currentRoom.assets];

      for (const newA of detectedAssets) {
        if (newA.boundingBox && newA.sourceImageIndex !== undefined) {
           if (newA.sourceImageIndex >= 0 && newA.sourceImageIndex < currentRoom.images.length) {
               const sourceImg = currentRoom.images[newA.sourceImageIndex];
               if (sourceImg && sourceImg.dataUrl.startsWith('data:image')) {
                   const croppedDataUrl = await cropImage(sourceImg.dataUrl, newA.boundingBox);
                   newCroppedImages[newA.id] = croppedDataUrl;
               }
           }
        }

        const existingIndex = finalAssets.findIndex(a => a.id === newA.id);
        if (existingIndex >= 0) {
           const existing = finalAssets[existingIndex];
           const trail = [...(existing.auditTrail || [])];
           const changes = [];
           if (existing.condition !== newA.condition) changes.push(`Condition updated: ${existing.condition} -> ${newA.condition}`);
           if (existing.riskRating !== newA.riskRating) changes.push(`Risk updated: ${existing.riskRating} -> ${newA.riskRating}`);
           if (changes.length > 0) trail.push({ timestamp: Date.now(), actor: 'AI', action: 'AI_REINSPECT', details: changes.join(', ') });

           let riskHistory = [...(existing.riskHistory || [])];
           if (existing.riskRating !== newA.riskRating) {
               riskHistory.push({
                   timestamp: Date.now(),
                   actor: 'AI',
                   previousRisk: existing.riskRating,
                   newRisk: newA.riskRating || 'Low'
               });
           }

           finalAssets[existingIndex] = {
               ...existing,
               ...newA,
               id: existing.id,
               auditTrail: trail,
               riskHistory,
               verified: false,
               aiDetected: true
           };
        } else {
           const dup = finalAssets.find(lockedA => lockedA.category === newA.category && lockedA.description.toLowerCase() === newA.description.toLowerCase());
           if (!dup) {
               finalAssets.push(newA);
           }
        }
      }

      updateCurrentRoom({ 
          assets: finalAssets,
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
                const qtyVal = isBuildingFabric(a.category) ? 'N/A' : a.quantity;
                return [
                    a.category, 
                    a.description, 
                    a.condition, 
                    a.riskRating || 'Low',
                    a.age || '',
                    a.justification, 
                    a.notes || '', 
                    qtyVal, 
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

          if (room.images && room.images.length > 0) {
              const imgWidth = 60;
              const imgHeight = 45;
              const gap = 5;
              let xOffset = 14;

              if (startY + imgHeight > pageHeight - 20) {
                  doc.addPage();
                  startY = 20;
              }

              room.images.forEach((img) => {
                  if (xOffset + imgWidth > pageWidth - 14) {
                      xOffset = 14;
                      startY += imgHeight + gap;
                      if (startY + imgHeight > pageHeight - 20) {
                          doc.addPage();
                          startY = 20;
                      }
                  }
                  try {
                      if (img.dataUrl) {
                          doc.addImage(img.dataUrl, xOffset, startY, imgWidth, imgHeight);
                      }
                  } catch (e) {
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
                      isBuildingFabric(a.category) ? 'N/A' : a.quantity,
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
                      4: { cellWidth: 10 }, 
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

  const exportToCSV = () => {
      let csvContent = "Building Name,Room Name,Category,Description,Condition,Risk Rating,Age,Justification,Notes,Quantity,Cost,RUL,Verified\n";
      
      appState.rooms.forEach(room => {
          room.assets.forEach(a => {
              const qtyVal = isBuildingFabric(a.category) ? "N/A" : a.quantity;
              const row = [
                  appState.siteInfo.name,
                  room.roomName,
                  a.category,
                  a.description.replace(/,/g, ';'),
                  a.condition,
                  a.riskRating || 'Low',
                  a.age || '',
                  a.justification.replace(/,/g, ';'),
                  (a.notes || '').replace(/,/g, ';'),
                  qtyVal,
                  a.cost,
                  a.rul,
                  a.verified ? "Yes" : "No"
              ].map(v => `"${v}"`).join(",");
              csvContent += row + "\n";
          });
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${appState.siteInfo.name}_Assessment.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const exportToJSON = () => {
      const cleanData = {
          site: appState.siteInfo,
          lastUpdated: new Date().toISOString(),
          rooms: appState.rooms.map(room => ({
              roomName: room.roomName,
              assets: room.assets.map(a => ({
                  ...a,
                  quantity: isBuildingFabric(a.category) ? 'N/A' : a.quantity
              }))
          }))
      };
      
      const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${appState.siteInfo.name}_Data.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const exportForRAG = () => {
      const data = appState.rooms.flatMap(room => 
          room.assets.map(asset => ({
              id: asset.id,
              content: `${appState.siteInfo.name}, ${room.roomName}: ${asset.category} - ${asset.description}. Condition: ${asset.condition}. Risk: ${asset.riskRating || 'Low'}. Age: ${asset.age || 'Unknown'}. Justification: ${asset.justification}. Notes: ${asset.notes}. Quantity: ${isBuildingFabric(asset.category) ? 'N/A' : asset.quantity}`,
              metadata: { building: appState.siteInfo.name, room: room.roomName, category: asset.category, cost: asset.cost, condition: asset.condition, risk: asset.riskRating, age: asset.age, auditLog: asset.auditTrail }
          }))
      );
      
      if (appState.siteInfo.notes) {
          data.push({
              id: 'site-summary',
              content: `Site Executive Summary for ${appState.siteInfo.name}: ${appState.siteInfo.notes}`,
              metadata: { 
                  building: appState.siteInfo.name, 
                  room: 'Summary', 
                  category: 'General', 
                  cost: '0', 
                  condition: 'N/A', 
                  risk: 'N/A', 
                  age: 'N/A', 
                  auditLog: [] as AuditEntry[]
              }
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
          setAppState(prev => ({ ...prev, view: 'summary' }));
          
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
    if (window.confirm("Delete ALL local data and start a new assessment? (Cloud data is preserved in Firestore)")) {
        setProcessing(true);
        setLoadingText("Clearing local data...");
        try {
            await firebaseService.deleteDatabase();
            // Force a hard reload to ensure all state is wiped
            window.location.href = window.location.origin;
        } catch (err) {
            console.error("Reset failed", err);
            // Fallback
            localStorage.clear();
            window.location.reload();
        }
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

  const riskChartData = useMemo(() => {
      if (!portfolioData || portfolioData.length === 0) return [];
      
      const end = new Date();
      const start = subMonths(end, 5);
      const months = eachMonthOfInterval({ start, end });
      
      return months.map(month => {
          const monthStr = format(month, 'MMM yyyy');
          let extremeCount = 0;
          let highCount = 0;
          
          portfolioData.forEach(site => {
              (site.rooms || []).forEach((room: Room) => {
                  (room.assets || []).forEach((asset: Asset) => {
                      let currentRisk = asset.riskRating || 'Low';
                      
                      if (asset.riskHistory && asset.riskHistory.length > 0) {
                          const sortedHistory = [...asset.riskHistory].sort((a, b) => b.timestamp - a.timestamp);
                          
                          for (const entry of sortedHistory) {
                              const entryDate = new Date(entry.timestamp);
                              // If this change happened AFTER the month we are looking at (and not in the same month)
                              if (entryDate > month && entryDate.getMonth() !== month.getMonth() && entryDate.getFullYear() !== month.getFullYear()) {
                                  currentRisk = entry.previousRisk || 'Low';
                              }
                          }
                      }
                      
                      if (currentRisk === 'Extreme') extremeCount++;
                      if (currentRisk === 'High') highCount++;
                  });
              });
          });
          
          return {
              name: monthStr,
              Extreme: extremeCount,
              High: highCount
          };
      });
  }, [portfolioData]);

  const currentAssessmentRiskDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      Low: 0,
      Medium: 0,
      High: 0,
      Extreme: 0
    };
    let totalAssets = 0;
    
    appState.rooms.forEach(room => {
      (room.assets || []).forEach(asset => {
        const r = asset.riskRating || 'Low';
        if (r in counts) {
          counts[r]++;
          totalAssets++;
        }
      });
    });

    const chartData = Object.keys(counts).map(key => ({
      name: key,
      value: counts[key]
    })).filter(d => d.value > 0);

    return { chartData, totalAssets, counts };
  }, [appState.rooms]);

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

      {editingAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="p-4 border-b flex justify-between items-center bg-indigo-50 rounded-t-xl">
                      <h3 className="text-lg font-bold text-indigo-800 flex items-center gap-2">
                          <span className="material-icons">edit</span> Edit Asset Details
                      </h3>
                      <button onClick={() => setEditingAsset(null)} className="text-gray-500 hover:text-gray-700">
                          <span className="material-icons">close</span>
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-12 gap-6">
                      
                      {/* Left Column: Visual Discovery & Audit History */}
                      <div className="col-span-1 md:col-span-5 space-y-4">
                          
                          {/* Extracted Asset Image Preview Card */}
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col shadow-xs">
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white rounded px-2 py-0.5 self-start mb-2 shadow-xs">
                                  Identified Asset Image
                              </span>
                              
                              {currentRoom.croppedImages[editingAsset.id] ? (
                                  <div className="relative w-full h-48 bg-white border border-slate-200 rounded-md overflow-hidden flex items-center justify-center group shadow-inner">
                                      <img 
                                          src={currentRoom.croppedImages[editingAsset.id]} 
                                          className="max-w-full max-h-full object-contain cursor-zoom-in hover:scale-[1.03] transition-transform duration-200" 
                                          alt="Extracted Asset"
                                          onClick={() => setPreviewImage(currentRoom.croppedImages[editingAsset.id])}
                                          title="Click to view full screen"
                                      />
                                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                          <span className="material-icons text-xs">zoom_in</span> Click to zoom
                                      </div>
                                  </div>
                              ) : (
                                  <div className="border border-dashed border-slate-300 rounded-md py-12 flex flex-col items-center justify-center text-slate-400 bg-white">
                                      <span className="material-icons text-4xl mb-1">image_not_supported</span>
                                      <span className="text-xs font-semibold">No cropped image available</span>
                                  </div>
                              )}

                              {/* Toggle context image if available */}
                              {editingAsset.sourceImageIndex !== undefined && currentRoom.images[editingAsset.sourceImageIndex] && (
                                  <button
                                      type="button"
                                      onClick={() => setPreviewImage(currentRoom.images[editingAsset.sourceImageIndex!].dataUrl)}
                                      className="mt-3 w-full text-xs text-indigo-700 hover:text-indigo-900 font-bold flex items-center justify-center gap-1.5 border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-100/70 py-2 rounded-md transition duration-150 shadow-inner"
                                  >
                                      <span className="material-icons text-sm">filter_center_focus</span> View Context/Source Image
                                  </button>
                              )}
                          </div>

                          {/* Governance & Audit History */}
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-gray-500 max-h-36 overflow-y-auto shadow-xs">
                              <strong className="block mb-1 text-slate-700 font-bold uppercase tracking-wider text-[10px]">Governance & Audit History:</strong>
                              <ul className="space-y-1 divide-y divide-slate-100">
                                  {(editingAsset.auditTrail || []).map((log, i) => (
                                     <li key={i} className="flex gap-2 pt-1.5 first:pt-0">
                                         <span className="font-mono text-slate-400 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                         <span className={`font-bold shrink-0 ${log.actor === 'AI' ? 'text-purple-600' : 'text-blue-600'}`}>[{log.actor}]</span>
                                         <span className="text-gray-700">{log.action}: {log.details}</span>
                                     </li>
                                  ))}
                                  {(!editingAsset.auditTrail || editingAsset.auditTrail.length === 0) && <li className="text-gray-400 italic">No history recorded.</li>}
                              </ul>
                          </div>

                          {/* Risk Trajectory */}
                          {editingAsset.riskHistory && editingAsset.riskHistory.length > 0 && (
                              <div className="bg-white border border-indigo-100 rounded-lg p-3 shadow-xs">
                                  <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-2 flex items-center gap-1">
                                      <span className="material-icons text-sm">timeline</span> Risk Trajectory
                                  </label>
                                  <div className="space-y-3 border-l-2 border-indigo-200 ml-2 pl-3 py-0.5 max-h-36 overflow-y-auto">
                                      {editingAsset.riskHistory.map((history, i) => (
                                          <div key={i} className="relative">
                                              <div className={`absolute -left-[17px] top-1 w-2 h-2 rounded-full ring-4 ring-white ${history.newRisk === 'Extreme' ? 'bg-red-500' : history.newRisk === 'High' ? 'bg-orange-500' : history.newRisk === 'Medium' ? 'bg-yellow-400' : 'bg-green-500'}`}></div>
                                              <div className="text-[9px] text-gray-400 font-mono uppercase tracking-wider">
                                                  {new Date(history.timestamp).toLocaleString()} • <strong className={history.actor === 'AI' ? 'text-purple-600' : 'text-blue-600'}>{history.actor}</strong>
                                              </div>
                                              <div className="text-xs text-gray-700">
                                                  Changed from <span className="font-medium text-gray-900">{history.previousRisk || 'Initial'}</span> to <span className={`font-bold ${history.newRisk === 'Extreme' ? 'text-red-600' : history.newRisk === 'High' ? 'text-orange-500' : history.newRisk === 'Medium' ? 'text-yellow-600' : 'text-green-600'}`}>{history.newRisk}</span>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* Right Column: Editable Metadata Controls */}
                      <div className="col-span-1 md:col-span-7 space-y-4 border-t md:border-t-0 md:border-l md:pl-6 border-slate-200">
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Category</label>
                              <select 
                                  value={editingAsset.category}
                                  onChange={(e) => setEditingAsset({...editingAsset, category: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                              >
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
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-20"
                                  placeholder="Detailed description..."
                              />
                          </div>

                          <div className="grid grid-cols-4 gap-3">
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Condition</label>
                                  <select 
                                      value={editingAsset.condition}
                                      onChange={(e) => setEditingAsset({...editingAsset, condition: e.target.value})}
                                      className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-xs"
                                  >
                                      {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Risk Rating</label>
                                  <select 
                                      value={editingAsset.riskRating || 'Low'}
                                      onChange={(e) => setEditingAsset({...editingAsset, riskRating: e.target.value})}
                                      className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-xs"
                                  >
                                      {RISK_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Age (Yrs)</label>
                                  <input 
                                      type="text"
                                      value={editingAsset.age || ''}
                                      onChange={(e) => setEditingAsset({...editingAsset, age: e.target.value})}
                                      className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs"
                                      placeholder="e.g. 15"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Quantity</label>
                                  <input 
                                      type="text"
                                      value={editingAsset.quantity}
                                      onChange={(e) => setEditingAsset({...editingAsset, quantity: e.target.value})}
                                      className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs"
                                  />
                              </div>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Justification</label>
                              <textarea 
                                  value={editingAsset.justification}
                                  onChange={(e) => setEditingAsset({...editingAsset, justification: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-16"
                                  placeholder="Why is it in this condition?"
                              />
                          </div>
                          
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Notes (Inspector Observations)</label>
                              <textarea 
                                  value={editingAsset.notes || ''}
                                  onChange={(e) => setEditingAsset({...editingAsset, notes: e.target.value})}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-16 bg-yellow-50"
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
          {/* OFFLINE BANNER */}
          {!effectiveIsOnline && (
              <div className="bg-orange-500 text-white p-3 rounded-xl mb-4 flex items-center justify-between shadow-lg animate-fade-in">
                  <div className="flex items-center gap-2">
                      <span className="material-icons">wifi_off</span>
                      <div>
                          <p className="font-bold text-sm">You are currently offline</p>
                          <p className="text-xs opacity-90">Data is being saved securely to your device (IndexedDB).</p>
                      </div>
                  </div>
              </div>
          )}

          {effectiveIsOnline && (
              <div className="fixed bottom-4 right-4 z-50">
                   <button 
                       onClick={handleSync} 
                       disabled={syncingOfflineData}
                       className="bg-green-600 text-white px-4 py-3 rounded-full shadow-2xl hover:bg-green-700 transition flex items-center gap-2 font-bold text-sm disabled:opacity-50"
                   >
                       <span className={`material-icons ${syncingOfflineData ? 'animate-spin' : ''}`}>sync</span>
                       {syncingOfflineData ? 'Syncing...' : 'Sync to Cloud'}
                   </button>
              </div>
          )}

          <header className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-4 mb-6 flex flex-wrap justify-between items-center gap-4">
              <div>
                  <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-2">
                    <span className="material-icons text-indigo-600">domain</span>
                    Building Asset Inspector
                  </h1>
                  <p className="text-xs text-gray-500">ISO 55001:2024 Compliant</p>
              </div>
              <div className="flex gap-2 items-center">
                  {viewMode === 'single' ? (
                      <button onClick={loadPortfolio} className="bg-purple-100 text-purple-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-purple-200 transition flex items-center gap-1">
                          <span className="material-icons text-sm">dashboard</span> Portfolio View
                      </button>
                  ) : (
                      <button onClick={() => setViewMode('single')} className="bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-200 transition flex items-center gap-1">
                          <span className="material-icons text-sm">edit_note</span> Single Inspection
                      </button>
                  )}

                  <div className="flex items-center gap-2 mr-2 border-r pr-4 border-gray-200">
                      <span className={`text-xs font-bold ${simulateOffline ? 'text-orange-500' : 'text-gray-500'}`}>
                          Simulate Offline
                      </span>
                      <button 
                          onClick={() => setSimulateOffline(!simulateOffline)}
                          className={`w-10 h-5 rounded-full p-1 transition-colors ${simulateOffline ? 'bg-orange-500' : 'bg-gray-300'}`}
                          title="Simulate network disconnect"
                      >
                          <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${simulateOffline ? 'translate-x-5' : 'translate-x-0'}`}></div>
                      </button>
                  </div>
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
                  {effectiveIsOnline ? (
                      <div className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-xs font-medium border border-green-100 min-w-max">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          Cloud Sync On
                      </div>
                  ) : (
                      <div className="flex items-center gap-1 bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 min-w-max">
                          <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                          Local DB
                      </div>
                  )}
              </div>
          </header>

          {viewMode === 'portfolio' ? (
              <div className="flex-1 p-4 animate-fade-in flex flex-col gap-6">
                  
                  {/* Realtime Connection Sync Queue Monitor Bar */}
                  {pendingQueueCount > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse shadow-sm">
                          <div className="flex items-center gap-3">
                              <div className="bg-amber-100 text-amber-800 p-2 rounded-full flex items-center justify-center">
                                  <span className="material-icons text-xl">cloud_queue</span>
                              </div>
                              <div>
                                  <h4 className="font-bold text-sm text-gray-900">Offline Queue: {pendingQueueCount} Pending Items</h4>
                                  <p className="text-xs text-gray-600">
                                      {syncMessage || 'Awaiting connection restoration to push latest changes to Firestore.'}
                                  </p>
                              </div>
                          </div>
                          {effectiveIsOnline && (
                              <button 
                                  onClick={async () => {
                                      setSyncingOfflineData(true);
                                      setSyncMessage('Manual push triggered...');
                                      const synced = await firebaseService.syncPendingQueue((p) => setSyncMessage(p));
                                      const remaining = await firebaseService.getPendingQueueCount();
                                      setPendingQueueCount(remaining);
                                      const fresh = await firebaseService.getAllInspections();
                                      setPortfolioData(fresh);
                                      setSyncingOfflineData(false);
                                      if (synced > 0) {
                                          setSyncMessage(`Successfully synchronized ${synced} inspections!`);
                                          setTimeout(() => setSyncMessage(''), 3500);
                                      } else {
                                          const errors = await firebaseService.getPendingQueueErrors();
                                          const hasPermissionError = errors.some(err => 
                                              err.toLowerCase().includes("permission") || 
                                              err.toLowerCase().includes("unauthorized") || 
                                              err.toUpperCase().includes("PERMISSION_DENIED")
                                          );
                                          if (hasPermissionError) {
                                              setSyncMessage("Manual Sync failed: Database Write Permission Denied.");
                                          } else {
                                              setSyncMessage("Offline database synced locally.");
                                              setTimeout(() => setSyncMessage(''), 3500);
                                          }
                                      }
                                  }}
                                  disabled={syncingOfflineData}
                                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition whitespace-nowrap shadow-sm disabled:opacity-50"
                              >
                                  Force Sync Now
                              </button>
                          )}
                      </div>
                  )}

                  {/* Sync Completed Notification Alert */}
                  {syncMessage && !syncingOfflineData && !syncMessage.includes('Processing') && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-bounce shadow-sm">
                          <div className="bg-green-100 text-green-800 p-1.5 rounded-full flex items-center justify-center">
                              <span className="material-icons text-base">cloud_done</span>
                          </div>
                          <span className="text-xs font-bold text-green-900">{syncMessage}</span>
                      </div>
                  )}

                  {/* Split Screen Master-Detail Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
                      
                      {/* Left Side: Directory Table Viewer */}
                      <div className="lg:col-span-7 bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
                          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                  <span className="material-icons text-indigo-600">format_list_bulleted</span> 
                                  Inspections Directory
                              </h2>
                              <div className="flex flex-col sm:flex-row gap-3">
                                  <div className="relative">
                                      <span className="material-icons absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">search</span>
                                      <input 
                                          type="text" 
                                          placeholder="Search site, address..." 
                                          className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 w-full sm:w-64 text-sm"
                                          value={portfolioSearch}
                                          onChange={e => setPortfolioSearch(e.target.value)}
                                      />
                                  </div>
                                  <select 
                                      className="border rounded-lg px-4 py-2 bg-gray-50 text-sm focus:ring-2 focus:ring-indigo-500"
                                      value={portfolioStatusFilter}
                                      onChange={e => setPortfolioStatusFilter(e.target.value)}
                                  >
                                      <option value="All">All Statuses</option>
                                      <option value="Complete">Complete</option>
                                      <option value="In Progress">In Progress</option>
                                  </select>
                              </div>
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-gray-200">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
                                      <tr>
                                          <th className="px-4 py-4">Status</th>
                                          <th className="px-4 py-4">Title / Name</th>
                                          <th className="px-4 py-4">Project ID</th>
                                          <th className="px-4 py-4 text-right">Action</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                      {filteredPortfolio.length > 0 ? filteredPortfolio.map((site, idx) => {
                                          const title = site.siteInfo?.name || 'Untitled Inspection';
                                          const isComplete = site.rooms?.every((r: any) => r.assets?.length > 0) ?? false;
                                          const statusText = isComplete ? 'Complete' : 'In Progress';
                                          const statusColor = isComplete ? 'bg-green-500' : 'bg-yellow-400';
                                          const siteId = site.id || title.trim().replace(/\s+/g, '_').toLowerCase();
                                          
                                          // Pseudo project ID based on first word or hash
                                          const projectId = title.split(' ')[0].replace(/[^0-9]/g, '') || String(idx + 1000);
                                          const isSelected = selectedMapSiteId === siteId;

                                          return (
                                              <tr 
                                                  key={siteId} 
                                                  onClick={() => setSelectedMapSiteId(siteId)}
                                                  className={`cursor-pointer transition-all hover:bg-slate-50 border-l-4 ${
                                                      isSelected ? 'bg-indigo-50/50 border-indigo-500' : 'border-transparent'
                                                  }`}
                                              >
                                                  <td className="px-4 py-4">
                                                      <div className="flex items-center gap-2">
                                                          <div className={`w-2 h-7 rounded-full ${statusColor}`}></div>
                                                          <span className="font-semibold text-xs text-gray-700">{statusText}</span>
                                                      </div>
                                                  </td>
                                                  <td className="px-4 py-4">
                                                      <div className="font-bold text-gray-900 text-sm">{title}</div>
                                                      <div className="text-[11px] text-gray-500">{site.siteInfo?.address}</div>
                                                      <div className="text-[10px] text-gray-400 mt-0.5">
                                                          Updated: {site.lastUpdated ? new Date(site.lastUpdated).toLocaleDateString() : 'N/A'}
                                                      </div>
                                                  </td>
                                                  <td className="px-4 py-4 font-mono text-xs text-gray-650">
                                                      {projectId}
                                                  </td>
                                                  <td className="px-4 py-4 text-right">
                                                      <button 
                                                          onClick={(e) => {
                                                              e.stopPropagation();
                                                              openInspection(site);
                                                          }}
                                                          className="bg-indigo-55 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition whitespace-nowrap"
                                                      >
                                                          {isComplete ? 'Review' : 'Resume'}
                                                      </button>
                                                  </td>
                                              </tr>
                                          );
                                      }) : (
                                          <tr>
                                              <td colSpan={4} className="px-6 py-12 text-center text-gray-400 border-dashed border-2 m-4 rounded-xl">
                                                  No inspections match your search criteria.
                                              </td>
                                          </tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>

                      {/* Right: GIS Asset Locator Map (Column span 5) */}
                      <div className="lg:col-span-5 bg-white rounded-2xl shadow-xl p-6 border border-gray-100 flex flex-col gap-4 lg:sticky lg:top-4 h-[590px]">
                          <div className="flex items-center justify-between">
                              <h3 className="text-base font-extrabold text-gray-950 flex items-center gap-1.5">
                                  <span className="material-icons text-indigo-600 text-xl">map</span>
                                  GIS Asset Locator
                              </h3>
                              <div className="flex bg-gray-100 p-0.5 rounded-lg text-[10px] font-bold border border-gray-200">
                                  <button 
                                      onClick={() => setMapLayerType('streets')}
                                      className={`px-2 py-1 rounded transition-all ${mapLayerType === 'streets' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                                  >
                                      Streets
                                  </button>
                                  <button 
                                      onClick={() => setMapLayerType('satellite')}
                                      className={`px-2 py-1 rounded transition-all ${mapLayerType === 'satellite' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                                  >
                                      Satellite
                                  </button>
                                  <button 
                                      onClick={() => setMapLayerType('cadastral')}
                                      className={`px-2 py-1 rounded transition-all ${mapLayerType === 'cadastral' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                                  >
                                      Cadastral
                                  </button>
                              </div>
                          </div>

                          {/* Map Frame Drawing */}
                          <div className="relative flex-1 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
                              {/* Background Map Simulation */}
                              {mapLayerType === 'satellite' ? (
                                  <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 opacity-95 flex flex-col items-center justify-center p-4">
                                      {/* Grid representation */}
                                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#33415515_1px,transparent_1px),linear-gradient(to_bottom,#33415515_1px,transparent_1px)] bg-[size:18px_18px]"></div>
                                      
                                      {selectedMapSiteId === 'colombo_port_warehouse_b' ? (
                                          <svg className="w-5/6 h-5/6 max-h-52 stroke-slate-700 fill-slate-900/50 opacity-80" viewBox="0 0 200 150">
                                              <rect x="10" y="30" width="180" height="90" rx="4" strokeWidth="0.75" strokeDasharray="2 2" />
                                              <circle cx="100" cy="75" r="45" stroke="#4f46e5" strokeWidth="0.5" strokeDasharray="1 3" />
                                              <rect x="80" y="65" width="40" height="20" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1" />
                                              <path d="M 0,110 L 200,110" stroke="#0ea5e9" strokeWidth="1" />
                                              <text x="12" y="125" fill="#38bdf8" fontSize="6" fontFamily="monospace">COLOMBO DEEP SHORELINE GRID SECTION C</text>
                                          </svg>
                                      ) : selectedMapSiteId === 'sydney_opera_house_annex' ? (
                                          <svg className="w-5/6 h-5/6 max-h-52 stroke-slate-700 fill-slate-900/50 opacity-80" viewBox="0 0 200 150">
                                              <path d="M10,80 C50,20 150,20 190,80" stroke="#f43f5e" strokeWidth="0.75" strokeDasharray="2 2" />
                                              <path d="M30,120 L70,85 L110,120 Z" fill="#1e1b4b" stroke="#f43f5e" strokeWidth="1" />
                                              <path d="M110,120 L150,85 L190,120 Z" fill="#1e1b4b" stroke="#f43f5e" strokeWidth="1" />
                                              <path d="M 0,120 L 200,120" stroke="#0ea5e9" strokeWidth="1" />
                                              <text x="12" y="132" fill="#38bdf8" fontSize="6" fontFamily="monospace">BENNELONG POINT MARITIME REEF GRID</text>
                                          </svg>
                                      ) : (
                                          <svg className="w-5/6 h-5/6 max-h-52 stroke-slate-700 fill-slate-900/50 opacity-80" viewBox="0 0 200 150">
                                              <rect x="30" y="25" width="140" height="100" strokeWidth="0.75" />
                                              <line x1="100" y1="25" x2="100" y2="125" stroke="#10b981" strokeWidth="0.5" strokeDasharray="1 1" />
                                              <line x1="30" y1="75" x2="170" y2="75" stroke="#10b981" strokeWidth="0.5" strokeDasharray="1 1" />
                                              <circle cx="100" cy="75" r="30" stroke="#10b981" strokeWidth="0.5" />
                                              <text x="12" y="138" fill="#38bdf8" fontSize="6" fontFamily="monospace">MELBOURNE MULTI-TIER CITY INTERSECT</text>
                                          </svg>
                                      )}
                                  </div>
                              ) : mapLayerType === 'cadastral' ? (
                                  <div className="absolute inset-0 bg-emerald-950/20 opacity-95 flex flex-col items-center justify-center p-4">
                                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b98110_1px,transparent_1px),linear-gradient(to_bottom,#10b98110_1px,transparent_1px)] bg-[size:12px_12px]"></div>
                                      <div className="border border-emerald-500/20 bg-slate-950/90 backdrop-blur p-4 rounded text-emerald-400 text-[10px] font-mono whitespace-pre text-left leading-5 shadow-lg">
                                          CAD-MAP ID: CAD-{selectedMapSiteId === 'sydney_opera_house_annex' ? '9903' : selectedMapSiteId === 'colombo_port_warehouse_b' ? '8801' : '3304'}<br />
                                          EST. PLOT SIZE: {selectedMapSiteId === 'sydney_opera_house_annex' ? '12,450 m²' : selectedMapSiteId === 'colombo_port_warehouse_b' ? '18,200 m²' : '9,800 m²'}<br />
                                          SECTOR: Heavy Commercial Infrastructure<br />
                                          RATING LEVEL: High-Trust Facility
                                      </div>
                                  </div>
                              ) : (
                                  <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 opacity-95">
                                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#38bdf805_1px,transparent_1px),linear-gradient(to_bottom,#38bdf805_1px,transparent_1px)] bg-[size:28px_28px]"></div>
                                      <svg className="w-10/12 h-10/12 max-h-52 stroke-slate-800 fill-none" viewBox="0 0 200 150">
                                          <circle cx="100" cy="75" r="60" stroke="#334155" strokeWidth="0.5" />
                                          <circle cx="100" cy="75" r="40" stroke="#334155" strokeWidth="0.5" />
                                          <circle cx="100" cy="75" r="20" stroke="#334155" strokeWidth="0.5" />
                                          <line x1="100" y1="0" x2="100" y2="150" stroke="#334155" strokeWidth="0.5" />
                                          <line x1="0" y1="75" x2="200" y2="75" stroke="#334155" strokeWidth="0.5" />
                                      </svg>
                                  </div>
                              )}

                              {/* Telemetry HUD */}
                              <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-800 p-2.5 rounded-lg text-[9px] font-mono text-slate-300 shadow-md text-left">
                                  <div className="text-indigo-400 font-extrabold uppercase text-[8px] mb-1 tracking-wide">HUD Metrics</div>
                                  {(() => {
                                      const site = portfolioData.find(s => {
                                          const siteId = s.id || (s.siteInfo?.name || '').trim().replace(/\s+/g, '_').toLowerCase();
                                          return siteId === selectedMapSiteId;
                                      });
                                      const latVal = site?.siteInfo?.latitude;
                                      const lngVal = site?.siteInfo?.longitude;
                                      return (
                                          <>
                                              <div>LAT: {latVal !== undefined ? `${Math.abs(latVal).toFixed(5)} ${latVal >= 0 ? 'N' : 'S'}` : (selectedMapSiteId === 'colombo_port_warehouse_b' ? '6.94970 N' : selectedMapSiteId === 'sydney_opera_house_annex' ? '33.85680 S' : '37.81010 S')}</div>
                                              <div>LNG: {lngVal !== undefined ? `${Math.abs(lngVal).toFixed(5)} ${lngVal >= 0 ? 'E' : 'W'}` : (selectedMapSiteId === 'colombo_port_warehouse_b' ? '79.84370 E' : selectedMapSiteId === 'sydney_opera_house_annex' ? '151.21530 E' : '144.96280 E')}</div>
                                          </>
                                      );
                                  })()}
                                  <div>ALT: 12.8m (MSL)</div>
                                  <div className="mt-1 flex items-center gap-1 text-green-400">
                                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                      TELEMETRY ACTIVE
                                  </div>
                              </div>

                              {/* Big Interactive Floating Icon Pin */}
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                                  <div className="bg-rose-500 text-white rounded-full p-2 hover:scale-110 active:scale-95 transition-transform duration-100 shadow-lg border-2 border-white animate-bounce pointer-events-auto">
                                      <span className="material-icons text-lg flex items-center">location_on</span>
                                  </div>
                                  <div className="bg-slate-900/95 text-slate-100 border border-slate-800 text-[10px] font-bold px-2 py-0.5 rounded shadow mt-1 whitespace-nowrap select-none">
                                      {portfolioData.find(s => {
                                          const siteId = s.id || (s.siteInfo?.name || '').trim().replace(/\s+/g, '_').toLowerCase();
                                          return siteId === selectedMapSiteId;
                                      })?.siteInfo?.name || 'Selected Property'}
                                  </div>
                              </div>
                              
                              {/* Bottom Right Compass */}
                              <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur p-1.5 rounded-full border border-slate-800 text-slate-400 flex items-center justify-center">
                                  <span className="material-icons text-xs" style={{ animation: 'spin 12s linear infinite' }}>explore</span>
                              </div>
                          </div>

                          {/* Selected Site Details Overlay Box */}
                          {(() => {
                              const selectedSite = portfolioData.find(s => {
                                  const siteId = s.id || (s.siteInfo?.name || '').trim().replace(/\s+/g, '_').toLowerCase();
                                  return siteId === selectedMapSiteId;
                              }) || portfolioData[0];

                              if (!selectedSite) return <div className="text-xs text-gray-400 text-center py-4 bg-slate-50 rounded-xl">Select a site table row to focus GIS properties.</div>;
                              
                              const numRooms = selectedSite.rooms?.length || 0;
                              const numAssets = selectedSite.rooms?.reduce((acc: number, r: any) => acc + (r.assets?.length || 0), 0) || 0;
                              const extremeCount = selectedSite.rooms?.reduce((acc: number, r: any) => acc + (r.assets?.filter((a: any) => a.riskRating === 'Extreme').length || 0), 0) || 0;
                              const highCount = selectedSite.rooms?.reduce((acc: number, r: any) => acc + (r.assets?.filter((a: any) => a.riskRating === 'High').length || 0), 0) || 0;

                              return (
                                  <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl flex flex-col gap-2">
                                      <div className="flex items-center justify-between">
                                          <div className="font-bold text-gray-950 text-xs sm:text-sm truncate max-w-[190px]">{selectedSite.siteInfo?.name || 'Colombo Site'}</div>
                                          <span className="text-[9px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full min-w-max">
                                              ISO 5500 Asset Compliance
                                          </span>
                                      </div>
                                      <div className="text-xs text-gray-500 line-clamp-1 italic">
                                          "{selectedSite.siteInfo?.notes || 'No specific facility audit records loaded.'}"
                                      </div>
                                      <div className="grid grid-cols-4 gap-1.5 text-center mt-1">
                                          <div className="bg-white p-1 rounded border border-gray-100 flex flex-col justify-center">
                                              <div className="text-[9px] text-gray-400 font-medium leading-none mb-1">Areas</div>
                                              <div className="text-sm font-extrabold text-slate-800">{numRooms}</div>
                                          </div>
                                          <div className="bg-white p-1 rounded border border-gray-100 flex flex-col justify-center">
                                              <div className="text-[9px] text-gray-400 font-medium leading-none mb-1">Assets</div>
                                              <div className="text-sm font-extrabold text-slate-800">{numAssets}</div>
                                          </div>
                                          <div className="bg-white p-1 rounded border border-red-100 flex flex-col justify-center">
                                              <div className="text-[9px] text-red-400 font-medium leading-none mb-1">Extreme</div>
                                              <div className="text-sm font-extrabold text-red-600">{extremeCount}</div>
                                          </div>
                                          <div className="bg-white p-1 rounded border border-orange-100 flex flex-col justify-center">
                                              <div className="text-[9px] text-orange-400 font-medium leading-none mb-1">High</div>
                                              <div className="text-sm font-extrabold text-orange-600">{highCount}</div>
                                          </div>
                                      </div>
                                      <div className="mt-2 text-right">
                                          <button 
                                              onClick={() => openInspection(selectedSite)}
                                              className="w-full bg-indigo-600 text-white rounded-lg py-2 text-xs font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-1 shadow-sm"
                                          >
                                              <span className="material-icons text-sm flex items-center justify-center">visibility</span>
                                              Audit Selected Facility
                                          </button>
                                      </div>
                                  </div>
                              );
                          })()}
                      </div>
                  </div>

                  {/* Risk Analysis Dashboard */}
                  <div className="bg-white rounded-2xl shadow-xl p-8 w-full">
                      <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                          <span className="material-icons text-red-600">warning</span> 
                          Risk Analysis Dashboard
                      </h2>
                      <p className="text-gray-600 mb-6">
                          Aggregated view of high and extreme risk assets across your portfolio.
                      </p>

                      <div className="mb-8 w-full h-64">
                          <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Risk Build Up Over Time (6 Months)</h3>
                          {riskChartData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={riskChartData}>
                                      <defs>
                                          <linearGradient id="colorExtreme" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                                          </linearGradient>
                                          <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                          </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dx={-10} />
                                      <RechartsTooltip 
                                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                      />
                                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }}/>
                                      <Area type="monotone" dataKey="Extreme" stroke="#dc2626" fillOpacity={1} fill="url(#colorExtreme)" strokeWidth={2} />
                                      <Area type="monotone" dataKey="High" stroke="#f97316" fillOpacity={1} fill="url(#colorHigh)" strokeWidth={2} />
                                  </AreaChart>
                              </ResponsiveContainer>
                          ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                  Not enough temporal data to build chart.
                              </div>
                          )}
                      </div>
                      
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                  <tr>
                                      <th className="px-4 py-3">Site</th>
                                      <th className="px-4 py-3">Room</th>
                                      <th className="px-4 py-3">Category</th>
                                      <th className="px-4 py-3">Asset Description</th>
                                      <th className="px-4 py-3">Risk Level</th>
                                      <th className="px-4 py-3">Condition</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {portfolioData.flatMap(site => 
                                      (site.rooms || []).flatMap((room: Room) => 
                                          (room.assets || [])
                                            .filter(a => a.riskRating === 'High' || a.riskRating === 'Extreme')
                                            .map(asset => (
                                                <tr key={`${site.id}-${asset.id}`} className="hover:bg-gray-50 border-l-4" style={{ 
                                                    borderLeftColor: asset.riskRating === 'Extreme' ? '#dc2626' : '#f97316'
                                                }}>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{site.siteInfo?.name || 'Unknown'}</td>
                                                    <td className="px-4 py-3 text-gray-600">{room.roomName}</td>
                                                    <td className="px-4 py-3 text-gray-600">{asset.category}</td>
                                                    <td className="px-4 py-3 text-gray-600">{asset.description}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold text-white ${asset.riskRating === 'Extreme' ? 'bg-red-600' : 'bg-orange-500'}`}>
                                                            {asset.riskRating}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600">{asset.condition}</td>
                                                </tr>
                                            ))
                                      )
                                  )}
                                  {portfolioData.flatMap(site => (site.rooms || []).flatMap((room: Room) => (room.assets || []).filter(a => a.riskRating === 'High' || a.riskRating === 'Extreme'))).length === 0 && (
                                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No high or extreme risk assets found in your portfolio.</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          ) : (
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
                                      <div className="relative text-left">
                                          <div className="flex gap-2">
                                              <div className="relative flex-1">
                                                  <input 
                                                      className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500 pr-10"
                                                      placeholder="e.g. 123 Main St"
                                                      value={appState.siteInfo.address}
                                                      onChange={(e) => handleAddressInputChange(e.target.value)}
                                                      onFocus={() => {
                                                          if (addressSuggestions.length > 0) setShowSuggestions(true);
                                                      }}
                                                  />
                                                  {isSearchingAddress && (
                                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                                                          <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                          </svg>
                                                      </div>
                                                  )}
                                              </div>
                                              <button 
                                                  onClick={detectLocation}
                                                  className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 flex items-center justify-center gap-1 transition"
                                                  title="Detect Location"
                                              >
                                                  <span className="material-icons">my_location</span>
                                              </button>
                                          </div>

                                          {/* Autocomplete Suggestions Menu Dropdown */}
                                          {showSuggestions && addressSuggestions.length > 0 && (
                                              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                                                  {addressSuggestions.map((suggestion, idx) => (
                                                      <button
                                                          key={idx}
                                                          type="button"
                                                          onClick={() => handleSelectSuggestion(suggestion)}
                                                          className="w-full text-left px-4 py-3 hover:bg-indigo-50/50 text-xs text-slate-800 transition flex flex-col gap-0.5"
                                                      >
                                                          <div className="font-semibold text-gray-900 truncate">{suggestion.label}</div>
                                                          <div className="font-mono text-[9px] text-gray-400">Coords: {suggestion.latitude.toFixed(4)}, {suggestion.longitude.toFixed(4)}</div>
                                                      </button>
                                                  ))}
                                              </div>
                                          )}
                                      </div>

                                      {/* Dynamic Location Error Alert */}
                                      {addressError && (
                                          <div className="mt-2 text-xs bg-red-50 border border-red-100 text-red-700 p-2.5 rounded-lg flex items-start gap-1.5 shadow-sm">
                                              <span className="material-icons text-red-500 text-sm mt-0.5 animate-bounce">info</span>
                                              <span className="leading-relaxed">{addressError}</span>
                                          </div>
                                      )}
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

                                  <div className="border border-dashed border-gray-300 p-4 rounded-xl">
                                      <label className="block text-sm font-medium text-gray-700 mb-2">Service / PM Reports (PDF/Image)</label>
                                      <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-indigo-200 bg-indigo-50 rounded-lg cursor-pointer hover:bg-indigo-100 transition">
                                          <div className="flex flex-col items-center">
                                              <span className="material-icons text-indigo-500 mb-1">upload_file</span>
                                              <span className="text-xs text-indigo-700 font-medium">Upload Document for AI Analysis</span>
                                          </div>
                                          <input type="file" className="hidden" accept="application/pdf,image/*" onChange={handleDocumentUpload} />
                                      </label>
                                      {appState.siteInfo.documents && appState.siteInfo.documents.length > 0 && (
                                          <div className="mt-3 space-y-2">
                                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Processed Documents</h4>
                                              {appState.siteInfo.documents.map(doc => (
                                                  <div key={doc.id} className="bg-gray-100 p-2 rounded text-xs flex justify-between items-center group">
                                                      <div className="truncate font-medium text-gray-700" title={doc.summary}>
                                                          <span className="material-icons text-sm align-middle mr-1 text-gray-500">description</span>
                                                          {doc.name}
                                                      </div>
                                                      <button 
                                                          onClick={() => {
                                                              setAppState(prev => ({
                                                                  ...prev,
                                                                  siteInfo: {
                                                                      ...prev.siteInfo,
                                                                      documents: prev.siteInfo.documents?.filter(d => d.id !== doc.id)
                                                                  }
                                                              }));
                                                          }}
                                                          className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                      >
                                                          <span className="material-icons text-sm">close</span>
                                                      </button>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>

                                  <div className="border border-dashed border-gray-300 p-4 rounded-xl mt-4">
                                      <label className="block text-sm font-medium text-gray-700 mb-2">Vendor Asset Register / Audit Report</label>
                                      <p className="text-xs text-gray-500 mb-3">Upload a vendor asset register or inspection report (PDF, Excel, image). The AI can extract elements from tables, lists, or unstructured narrative text to automatically populate the assessment.</p>
                                      <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-green-200 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition">
                                          <div className="flex flex-col items-center">
                                              <span className="material-icons text-green-500 mb-1">domain_verification</span>
                                              <span className="text-xs text-green-700 font-medium">Extract Vendor Data</span>
                                          </div>
                                          <input type="file" className="hidden" accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/*" onChange={handleVendorRegisterUpload} />
                                      </label>
                                  </div>

                                  <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3 mt-4">
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
                                                  <tr key={asset.id} className={`hover:bg-gray-100 group border-l-4 transition-colors ${
                                                      asset.riskRating === 'Extreme' ? 'border-red-600 bg-red-50' :
                                                      asset.riskRating === 'High' ? 'border-orange-500 bg-orange-50' :
                                                      asset.riskRating === 'Medium' ? 'border-yellow-400' :
                                                      'border-transparent'
                                                  } ${asset.verified && asset.riskRating !== 'Extreme' && asset.riskRating !== 'High' ? 'bg-green-50/50' : ''}`}>
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
                                                                  className="w-12 h-12 object-contain border rounded bg-white cursor-zoom-in hover:opacity-80 transition shadow-sm" 
                                                                  alt="Asset"
                                                                  onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setPreviewImage(currentRoom.croppedImages[asset.id]);
                                                                  }}
                                                                  title="Click to magnify"
                                                              />
                                                          ) : (
                                                              <div className="w-12 h-12 bg-white border rounded shadow-sm flex items-center justify-center text-gray-300">
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
                                                              {!ASSET_CATEGORIES.includes(asset.category) && <option value={asset.category}>{asset.category}</option>}
                                                              {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                          </select>
                                                      </td>
                                                      <td className="px-4 py-3">
                                                          <textarea 
                                                              value={asset.description}
                                                              onChange={(e) => updateAsset(asset.id, 'description', e.target.value)}
                                                              className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none text-gray-700"
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
                                                          <div className="flex items-center gap-1 group/risk">
                                                              <select
                                                                  value={asset.riskRating || 'Low'}
                                                                  onChange={(e) => updateAsset(asset.id, 'riskRating', e.target.value)}
                                                                  className={`rounded px-2 py-1 text-xs font-bold border-0 cursor-pointer ${
                                                                      asset.riskRating === 'Extreme' ? 'bg-red-600 text-white' :
                                                                      asset.riskRating === 'High' ? 'bg-orange-500 text-white shadow-sm' :
                                                                      asset.riskRating === 'Medium' ? 'bg-yellow-400 text-yellow-900' :
                                                                      'bg-green-100 text-green-800'
                                                                  }`}
                                                              >
                                                                  {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                                              </select>
                                                              {asset.riskHistory && asset.riskHistory.length > 0 && (
                                                                  <div className="relative">
                                                                      <span className="material-icons text-gray-400 hover:text-indigo-600 cursor-help text-[16px] transition-colors">history</span>
                                                                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-gray-900 text-white text-xs rounded shadow-lg p-2 opacity-0 group-hover/risk:opacity-100 pointer-events-none transition-opacity z-10 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-gray-900">
                                                                          <div className="font-bold border-b border-gray-700 pb-1 mb-1">Risk History</div>
                                                                          <ul className="space-y-1 max-h-32 overflow-y-auto">
                                                                              {asset.riskHistory.slice().reverse().map((rec, i) => (
                                                                                  <li key={i} className="flex justify-between items-center text-[10px]">
                                                                                      <span className="text-gray-400">{new Date(rec.timestamp).toLocaleDateString()}</span>
                                                                                      <span>{rec.previousRisk || 'Low'} <span className="text-gray-500">→</span> <span className={rec.newRisk === 'Extreme' ? 'text-red-400' : rec.newRisk === 'High' ? 'text-orange-400' : 'text-gray-200'}>{rec.newRisk}</span></span>
                                                                                  </li>
                                                                              ))}
                                                                          </ul>
                                                                      </div>
                                                                  </div>
                                                              )}
                                                          </div>
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
                                                      <td className="px-2 py-3 text-center">
                                                          {asset.aiDetected && (
                                                              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">AI</span>
                                                          )}
                                                      </td>
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

                              {/* Real-time Asset Risk Distribution & Visual Health Report */}
                              <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-6 mb-8 shadow-sm">
                                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                      <span className="material-icons text-indigo-600 text-lg">donut_large</span>
                                      Visual Health Report (Risk Profile)
                                  </h3>
                                  
                                  {currentAssessmentRiskDistribution.totalAssets === 0 ? (
                                      <div className="text-center py-6 text-gray-400 text-sm">
                                          <span className="material-icons text-3xl mb-1 block">grid_view</span>
                                          No assets logged in this assessment yet. Undergo camera audits to register assets.
                                      </div>
                                  ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                          {/* Donut Chart with Centered Total Count */}
                                          <div className="relative flex items-center justify-center h-[200px]">
                                              <ResponsiveContainer width="100%" height="105%">
                                                  <PieChart>
                                                      <Pie
                                                          data={currentAssessmentRiskDistribution.chartData}
                                                          cx="50%"
                                                          cy="50%"
                                                          innerRadius={60}
                                                          outerRadius={80}
                                                          paddingAngle={4}
                                                          dataKey="value"
                                                      >
                                                          {currentAssessmentRiskDistribution.chartData.map((entry, index) => (
                                                              <Cell key={`cell-${index}`} fill={RISK_COLORS[entry.name] || '#10B981'} />
                                                          ))}
                                                      </Pie>
                                                      <RechartsTooltip 
                                                          formatter={(value: any) => [`${value} Asset(s)`, 'Count']}
                                                          contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                                                      />
                                                  </PieChart>
                                              </ResponsiveContainer>
                                              
                                              {/* Absolute Center Text */}
                                              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                                                  <span className="text-3xl font-extrabold text-gray-800 leading-none">
                                                      {currentAssessmentRiskDistribution.totalAssets}
                                                  </span>
                                                  <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mt-1">
                                                      Total Assets
                                                  </span>
                                              </div>
                                          </div>
                                          
                                          {/* Risk Distribution Details & Insight */}
                                          <div className="space-y-3">
                                              <div className="space-y-1.5">
                                                  {RISK_OPTIONS.map((risk: string) => { const count = (currentAssessmentRiskDistribution.counts as Record<string, number>)[risk] || 0;
                                                      const percentage = currentAssessmentRiskDistribution.totalAssets > 0 
                                                          ? Math.round((count / currentAssessmentRiskDistribution.totalAssets) * 100) 
                                                          : 0;
                                                      return (
                                                          <div key={risk} className="flex items-center justify-between text-xs text-gray-600">
                                                              <div className="flex items-center gap-2">
                                                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS[risk] }}></span>
                                                                  <span className="font-semibold text-gray-700">{risk} Risk:</span>
                                                              </div>
                                                              <span className="font-mono text-gray-500 font-medium">
                                                                  {count} ({percentage}%)
                                                              </span>
                                                          </div>
                                                      );
                                                  })}
                                              </div>
                                              
                                              <div className="pt-3 border-t border-gray-100">
                                                  <p className="text-[11px] leading-relaxed text-gray-500 font-medium">
                                                      {currentAssessmentRiskDistribution.counts.Extreme > 0 ? (
                                                          <span className="text-red-600 flex items-start gap-1">
                                                              <span className="material-icons text-xs mt-0.5">warning</span>
                                                              <span><strong>Action Required:</strong> Critical operations attention needed for {currentAssessmentRiskDistribution.counts.Extreme} extreme risk item(s).</span>
                                                          </span>
                                                      ) : currentAssessmentRiskDistribution.counts.High > 0 ? (
                                                          <span className="text-orange-600 flex items-start gap-1">
                                                              <span className="material-icons text-xs mt-0.5">warning</span>
                                                              <span><strong>Alert:</strong> Schedule remediation works for {currentAssessmentRiskDistribution.counts.High} high risk asset(s).</span>
                                                          </span>
                                                      ) : (
                                                          <span className="text-green-600 flex items-start gap-1">
                                                              <span className="material-icons text-xs mt-0.5">check_circle</span>
                                                              <span><strong>Stable:</strong> Site exhibits a low risk-density profile. Ready to export.</span>
                                                          </span>
                                                      )}
                                                  </p>
                                              </div>
                                          </div>
                                      </div>
                                  )}
                              </div>

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
                                      <li>• <strong>Excel & CSV:</strong> Complete datasets + Site Notes.</li>
                                      <li>• <strong>PDF:</strong> Professional report + Executive Summary.</li>
                                      <li>• <strong>JSON & RAG:</strong> Structured data for technical use.</li>
                                  </ul>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                                  <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-2xl">description</span>
                                      <span className="font-bold text-sm">Excel</span>
                                  </button>
                                  <button onClick={exportToCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-2xl">table_rows</span>
                                      <span className="font-bold text-sm">CSV</span>
                                  </button>
                                  <button onClick={exportToPDF} className="bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-2xl">picture_as_pdf</span>
                                      <span className="font-bold text-sm">PDF Report</span>
                                  </button>
                                  <button onClick={exportToJSON} className="bg-amber-600 hover:bg-amber-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-2xl">javascript</span>
                                      <span className="font-bold text-sm">JSON</span>
                                  </button>
                                  <button onClick={exportForRAG} className="bg-sky-600 hover:bg-sky-700 text-white py-4 rounded-xl shadow-lg flex flex-col items-center gap-2 transition transform hover:scale-105">
                                      <span className="material-icons text-2xl">hub</span>
                                      <span className="font-bold text-sm">RAG Sync</span>
                                  </button>
                              </div>

                              <div className="flex flex-col gap-3">
                                  <button onClick={() => setAppState(prev => ({ ...prev, view: 'assessment', currentRoomIndex: 0 }))} className="text-indigo-600 font-medium hover:underline">
                                      Return to Review
                                  </button>
                                  <button 
                                      onClick={handleReset} 
                                      className="mt-4 border border-red-200 text-red-500 hover:bg-red-50 py-3 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
                                  >
                                      <span className="material-icons text-sm">delete_forever</span>
                                      Start New Assessment (Clear Data)
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}
              </>
          )}
      </div>

      {(viewMode === 'portfolio' || appState.view !== 'welcome') && (
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
