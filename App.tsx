
// Updated Live Sync Configuration
import React, { useState, useEffect, useMemo } from 'react';
import { SiteInfo, Room, AppState, Asset, ChatMessage, AuditEntry } from './types';
import { firebaseService } from './services/firebaseService';
import { detectAssetsWithBoundingBoxes, cropImage, summarizeConversation, analyzeDocument, extractAssetsFromVendorRegister } from './services/geminiService';
import { usePresenceSession } from './hooks/usePresenceSession';
import { useRoomAutosave } from './hooks/useRoomAutosave';
import { ChatBot } from './components/ChatBot';
import { ArchitecturalReconstruction } from './components/ArchitecturalReconstruction';
import { WelcomeView } from './components/WelcomeView';
import { PortfolioView } from './components/PortfolioView';
import { RoomAssessmentView } from './components/RoomAssessmentView';
import { AssessmentSummaryView } from './components/AssessmentSummaryView';
import { AIAgentOS } from './components/AIAgentOS';
import { HealthDashboardView } from './components/HealthDashboardView';
import { EditAssetModal } from './components/EditAssetModal';
import { MobileAppFrame } from './components/MobileAppFrame';
import { format, subMonths, startOfMonth, eachMonthOfInterval, isSameMonth, parseISO } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

import { ASSET_CATEGORIES, CONDITION_OPTIONS, RISK_OPTIONS, RISK_COLORS, INITIAL_ROOM_STATE } from './constants';
import {
  fetchGooglePlaceSuggestions,
  geocodeAddressGoogle,
  reverseGeocodeGoogle,
  getCurrentDeviceLocation,
} from './services/googleMapsService';

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
  const [isMobileMode, setIsMobileMode] = useState<boolean>(false);
  
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

  // Real-time collaboration & presence states
  const [inspectorProfile, setInspectorProfile] = useState<{ userId: string, name: string, email: string }>(() => {
      const cached = localStorage.getItem('inspector_profile');
      if (cached) {
          try {
              return JSON.parse(cached);
          } catch (e) {}
      }
      const randomId = Math.random().toString(36).substring(2, 9);
      const randNum = Math.floor(1000 + Math.random() * 9000);
      const profile = {
          userId: 'user_' + randomId,
          name: 'Inspector ' + randNum,
          email: `inspector.${randNum}@company.com`
      };
      localStorage.setItem('inspector_profile', JSON.stringify(profile));
      return profile;
  });

  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);

  const currentInspectionId = useMemo(() => {
      if (!appState.siteInfo.name) return '';
      return appState.siteInfo.name.trim().replace(/\s+/g, '_').toLowerCase();
  }, [appState.siteInfo.name]);

  const {
      activePresences,
      hasEditLock,
      setHasEditLock,
      isEditingPresence,
      setIsEditingPresence,
      getAvatarColor,
      getInitials,
  } = usePresenceSession({
      currentInspectionId,
      effectiveIsOnline,
      viewMode,
      appView: appState.view,
      inspectorProfile,
  });

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
    if (!hasEditLock) return;
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
      // 1. Try Google Maps Places Suggestions
      const googleSuggestions = await fetchGooglePlaceSuggestions(value);
      if (googleSuggestions && googleSuggestions.length > 0) {
        // Geocode each suggestion or provide structured suggestions
        const mapped = googleSuggestions.map((s) => ({
          label: s.description,
          placeId: s.placeId,
          mainText: s.mainText,
          secondaryText: s.secondaryText,
          latitude: s.latitude,
          longitude: s.longitude,
        }));
        setAddressSuggestions(mapped);
        setShowSuggestions(true);
        return;
      }

      // 2. Direct Geocoding fallback with Google Maps Geocoder
      const geocoded = await geocodeAddressGoogle(value);
      if (geocoded) {
        setAddressSuggestions([{
          label: geocoded.formattedAddress,
          placeId: geocoded.placeId,
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
        }]);
        setShowSuggestions(true);
      } else {
        setAddressSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      console.warn("Google Maps place search notice:", err);
    } finally {
      setIsSearchingAddress(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: any) => {
    let lat = suggestion.latitude;
    let lng = suggestion.longitude;

    if (lat === undefined || lng === undefined) {
      try {
        const resolved = await geocodeAddressGoogle(suggestion.label);
        if (resolved) {
          lat = resolved.latitude;
          lng = resolved.longitude;
        }
      } catch (e) {
        console.warn("Could not geocode selected suggestion:", e);
      }
    }

    setAppState(prev => ({
      ...prev,
      siteInfo: {
        ...prev.siteInfo,
        address: suggestion.label,
        latitude: lat,
        longitude: lng,
        placeId: suggestion.placeId,
      }
    }));
    setAddressSuggestions([]);
    setShowSuggestions(false);
  };

  const saveGlobalState = () => {
    if (!hasEditLock) return;
    firebaseService.saveState(appState.siteInfo, appState.rooms);
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!hasEditLock) {
          alert("Edit Lock Required: You currently do not have edit control for this session.");
          e.target.value = '';
          return;
      }

      setProcessing(true);
      setLoadingText(`Analyzing ${file.name}...`);

      try {
          const reader = new FileReader();
          reader.onload = async () => {
              try {
                  const dataUrl = reader.result as string;
                  if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                      const summary = await analyzeDocument(dataUrl, file.type, file.name);
                      
                      const newDoc = {
                          id: crypto.randomUUID(),
                          name: file.name,
                          summary,
                          dateAdded: Date.now(),
                          dataUrl,
                          mimeType: file.type
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
              } catch (innerErr) {
                  console.error("Document analysis error:", innerErr);
                  alert("Error analyzing document. Please try again.");
              } finally {
                  setProcessing(false);
                  setLoadingText('');
              }
          };
          reader.onerror = () => {
              alert("Failed to read file.");
              setProcessing(false);
              setLoadingText('');
          };
          reader.readAsDataURL(file);
      } catch (err) {
          console.error(err);
          setProcessing(false);
          setLoadingText('');
      } finally {
          if (e.target) {
              e.target.value = '';
          }
      }
  };

  const handleVendorRegisterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!hasEditLock) {
          alert("Edit Lock Required: You currently do not have edit control for this session.");
          e.target.value = '';
          return;
      }

      setProcessing(true);
      setLoadingText(`Extracting assets from ${file.name}...`);

      try {
          const reader = new FileReader();
          reader.onload = async () => {
              try {
                  const dataUrl = reader.result as string;
                  const groupedAssets = await extractAssetsFromVendorRegister(dataUrl, file.type, file.name);
                  
                  if (groupedAssets.length > 0) {
                      let newRooms = appState.rooms.map(r => ({...r, assets: [...r.assets]}));
                      
                      groupedAssets.forEach(group => {
                          let roomIndex = newRooms.findIndex(r => r.roomName.toLowerCase() === group.roomName.toLowerCase());
                          if (roomIndex === -1) {
                              newRooms.push({
                                  ...INITIAL_ROOM_STATE,
                                  id: crypto.randomUUID(),
                                  roomName: group.roomName,
                                  buildingName: appState.siteInfo.name || 'Building',
                                  assets: []
                              });
                              roomIndex = newRooms.length - 1;
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
                              verified: true,
                              aiDetected: true
                          }));
                          
                          newRooms[roomIndex].assets.push(...mappedAssets);
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
              } catch (innerErr) {
                  console.error("Vendor register extraction error:", innerErr);
                  alert("Failed to parse vendor register file.");
              } finally {
                  setProcessing(false);
                  setLoadingText('');
              }
          };
          reader.onerror = () => {
              alert("Failed to read vendor file.");
              setProcessing(false);
              setLoadingText('');
          };
          reader.readAsDataURL(file);
      } catch (err) {
          console.error(err);
          setProcessing(false);
          setLoadingText('');
          alert("Failed to parse the file.");
      } finally {
          if (e.target) {
              e.target.value = '';
          }
      }
  };

  const startAssessment = async () => {
    let lat = appState.siteInfo.latitude;
    let lng = appState.siteInfo.longitude;

    if (appState.siteInfo.address && (lat === undefined || lng === undefined)) {
      setLoadingText("Resolving facility coordinates with Google Maps...");
      setProcessing(true);
      try {
        const geoResult = await geocodeAddressGoogle(appState.siteInfo.address);
        if (geoResult) {
          lat = geoResult.latitude;
          lng = geoResult.longitude;
        }
      } catch (err) {
        console.warn("Background geocoding on submit notice:", err);
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
        let updatedRooms = [...appState.rooms];
        if (appState.siteInfo.numRooms !== updatedRooms.length) {
            if (appState.siteInfo.numRooms > updatedRooms.length) {
                // Append rooms
                const extraRooms = Array.from({ length: appState.siteInfo.numRooms - updatedRooms.length }).map((_, i) => {
                    const idx = updatedRooms.length + i;
                    return {
                        ...INITIAL_ROOM_STATE,
                        id: crypto.randomUUID(),
                        roomName: idx === 0 ? 'Building Exterior' : `Room ${idx}`,
                        buildingName: appState.siteInfo.name || updatedSiteInfo.name
                    };
                });
                updatedRooms = [...updatedRooms, ...extraRooms];
            } else {
                // Shrink rooms
                updatedRooms = updatedRooms.slice(0, appState.siteInfo.numRooms);
            }
        }
        setAppState(prev => ({
            ...prev,
            siteInfo: updatedSiteInfo,
            rooms: updatedRooms,
            view: 'assessment',
            currentRoomIndex: Math.min(prev.currentRoomIndex, updatedRooms.length - 1)
        }));
        firebaseService.saveState(updatedSiteInfo, updatedRooms);
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

  const requestRoomSave = useRoomAutosave(appState.siteInfo, appState.rooms);

  const updateCurrentRoom = (updates: Partial<Room>) => {
    if (!hasEditLock) return;
    setAppState(prev => {
      if (!prev.rooms[prev.currentRoomIndex]) return prev;
      const rooms = [...prev.rooms];
      rooms[prev.currentRoomIndex] = { ...rooms[prev.currentRoomIndex], ...updates };
      return { ...prev, rooms };
    });
    // React batches this with the room update; persistence observes committed state.
    requestRoomSave();
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

  const saveEditedAsset = (incomingAsset?: Asset) => {
      const targetAsset = incomingAsset || editingAsset;
      if(!targetAsset) return;
      const room = appState.rooms[appState.currentRoomIndex];
      if (!room) return;
      const updatedAssets = room.assets.map(a => {
        if (a.id === targetAsset.id) {
            // Compare and Log changes for key fields
            const changes: string[] = [];
            if(a.condition !== targetAsset.condition) changes.push(`Condition: ${a.condition} -> ${targetAsset.condition}`);
            
            let riskHistory = [...(a.riskHistory || [])];
            if(a.riskRating !== targetAsset.riskRating) {
                changes.push(`Risk: ${a.riskRating} -> ${targetAsset.riskRating}`);
                riskHistory.push({
                    timestamp: Date.now(),
                    actor: 'USER',
                    previousRisk: a.riskRating,
                    newRisk: targetAsset.riskRating || 'Low' // Default to Low if missing
                });
            }
            
            let newTrail = [...(a.auditTrail || [])];
            if (changes.length > 0) {
                 newTrail.push(createAuditEntry('BULK_EDIT', changes.join(', ')));
            } else {
                 newTrail.push(createAuditEntry('EDIT', 'Updated asset details'));
            }

            return { ...targetAsset, auditTrail: newTrail, riskHistory };
        }
        return a;
      });
      updateCurrentRoom({ assets: updatedAssets });
      setEditingAsset(null);
  };

  const isBuildingFabric = (category: string) => category.startsWith("Building Structural & Fabric");

  const detectLocation = async () => {
    setAddressError(null);
    setLoadingText("Detecting device GPS coordinates...");
    setProcessing(true);

    try {
      const position = await getCurrentDeviceLocation();
      const { latitude, longitude } = position;
      
      setLoadingText("Resolving location with Google Maps...");
      const geoResult = await reverseGeocodeGoogle(latitude, longitude);

      const finalAddress = geoResult?.formattedAddress || `Lat: ${latitude.toFixed(5)}, Long: ${longitude.toFixed(5)}`;

      setAppState(prev => ({
        ...prev,
        siteInfo: {
          ...prev.siteInfo,
          address: finalAddress,
          latitude,
          longitude,
          placeId: geoResult?.placeId,
        }
      }));
    } catch (err: any) {
      console.warn("GPS Detection error:", err);
      setAddressError(err?.message || "Could not retrieve GPS location. Please enter address manually.");
    } finally {
      setProcessing(false);
      setLoadingText("");
    }
  };

  const togglePrivacyMode = () => {
      setAppState(prev => ({ ...prev, privacyMode: !prev.privacyMode }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    // Automatically ensure edit intent so lock check never blocks single users
    if (!hasEditLock) {
      setHasEditLock(true);
      setIsEditingPresence(true);
    }

    const files: File[] = Array.from(e.target.files);
    const currentRoom = appState.rooms[appState.currentRoomIndex];

    if (!currentRoom) {
      alert("No active room selected.");
      if (e.target) e.target.value = '';
      return;
    }

    const MAX_IMAGES = 10;
    if (currentRoom.images.length + files.length > MAX_IMAGES) {
      alert(`Maximum ${MAX_IMAGES} images allowed per room. You currently have ${currentRoom.images.length} image(s). Please remove some existing photos or select fewer files.`);
      if (e.target) e.target.value = '';
      return;
    }

    setProcessing(true);
    setLoadingText('Processing & optimizing uploaded photo(s)...');

    try {
      const newImages: Array<{ id: string; dataUrl: string; name: string; timestamp: number }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (files.length > 1) {
          setLoadingText(`Optimizing photo ${i + 1} of ${files.length}...`);
        }

        try {
          const imageObj = await new Promise<{ id: string; dataUrl: string; name: string; timestamp: number }>((resolve) => {
            const reader = new FileReader();
            reader.onerror = () => {
              console.warn(`FileReader error on ${file.name}`);
              resolve({
                id: crypto.randomUUID(),
                dataUrl: '',
                name: file.name,
                timestamp: Date.now()
              });
            };
            reader.onload = (event) => {
              const result = event.target?.result as string;
              if (!result) {
                resolve({
                  id: crypto.randomUUID(),
                  dataUrl: '',
                  name: file.name,
                  timestamp: Date.now()
                });
                return;
              }

              // Compress & downscale large photos for high speed and minimal RAM usage
              const img = new Image();
              img.onerror = () => {
                resolve({
                  id: crypto.randomUUID(),
                  dataUrl: result,
                  name: file.name,
                  timestamp: Date.now()
                });
              };
              img.onload = () => {
                try {
                  const MAX_DIM = 1280;
                  let width = img.naturalWidth || img.width || 800;
                  let height = img.naturalHeight || img.height || 600;

                  if (width > MAX_DIM || height > MAX_DIM) {
                    if (width > height) {
                      height = Math.round((height * MAX_DIM) / width);
                      width = MAX_DIM;
                    } else {
                      width = Math.round((width * MAX_DIM) / height);
                      height = MAX_DIM;
                    }
                  }

                  const canvas = document.createElement('canvas');
                  canvas.width = Math.max(1, width);
                  canvas.height = Math.max(1, height);
                  const ctx = canvas.getContext('2d');

                  if (!ctx) {
                    resolve({
                      id: crypto.randomUUID(),
                      dataUrl: result,
                      name: file.name,
                      timestamp: Date.now()
                    });
                    return;
                  }

                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, width, height);
                  const compressed = canvas.toDataURL('image/jpeg', 0.82);
                  resolve({
                    id: crypto.randomUUID(),
                    dataUrl: compressed,
                    name: file.name,
                    timestamp: Date.now()
                  });
                } catch {
                  resolve({
                    id: crypto.randomUUID(),
                    dataUrl: result,
                    name: file.name,
                    timestamp: Date.now()
                  });
                }
              };
              img.src = result;
            };
            reader.readAsDataURL(file);
          });

          if (imageObj.dataUrl) {
            newImages.push(imageObj);
          }
        } catch (fileErr) {
          console.warn(`Could not process file ${file.name}:`, fileErr);
        }
      }

      if (newImages.length > 0) {
        const updatedImages = [...currentRoom.images, ...newImages];
        updateCurrentRoom({ images: updatedImages });
      }
    } catch (err) {
      console.error("Error reading photo upload:", err);
      alert("Failed to process selected image(s). Please ensure they are valid image files (JPG, PNG, WEBP, GIF).");
    } finally {
      setProcessing(false);
      setLoadingText('');
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const generateAssetsWithAI = async () => {
    const currentRoom = appState.rooms[appState.currentRoomIndex];
    if (!currentRoom) return;
    if (!currentRoom.images || currentRoom.images.length === 0) {
      alert("Please add or upload at least one area photo first.");
      return;
    }

    if (!hasEditLock) {
      setHasEditLock(true);
      setIsEditingPresence(true);
    }

    setProcessing(true);
    setLoadingText('Analyzing Building Fabric & Services (ISO 55000)...');

    try {
      const detectedAssets = await detectAssetsWithBoundingBoxes(currentRoom.images, ASSET_CATEGORIES, appState.privacyMode, currentRoom.assets);
      
      setLoadingText('Cropping asset bounding boxes...');
      const newCroppedImages = { ...currentRoom.croppedImages };
      
      let finalAssets = [...(currentRoom.assets || [])];

      for (const newA of detectedAssets) {
        if (newA.boundingBox && newA.sourceImageIndex !== undefined) {
           if (newA.sourceImageIndex >= 0 && newA.sourceImageIndex < currentRoom.images.length) {
               const sourceImg = currentRoom.images[newA.sourceImageIndex];
               if (sourceImg && sourceImg.dataUrl) {
                   try {
                     const croppedDataUrl = await cropImage(sourceImg.dataUrl, newA.boundingBox);
                     newCroppedImages[newA.id] = croppedDataUrl;
                   } catch (cropErr) {
                     console.warn("Crop skipped for asset:", cropErr);
                   }
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
      console.error("AI Asset generation error:", e);
      alert(e instanceof Error ? e.message : "Asset detection failed. Existing assets are unchanged; please retry.");
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
                  (a.description || '').replace(/,/g, ';'),
                  a.condition,
                  a.riskRating || 'Low',
                  a.age || '',
                  (a.justification || '').replace(/,/g, ';'),
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

  const populateSampleBuildingData = () => {
    const makeAsset = (
      name: string,
      category: string,
      description: string,
      condition: string,
      riskRating: string,
      cost: string,
      age: string,
      rul: string,
      justification: string = 'Routine multi-point facility condition audit'
    ): Asset => ({
      id: crypto.randomUUID(),
      name,
      category,
      description,
      condition,
      riskRating,
      cost,
      age,
      rul,
      justification,
      quantity: 1,
      aiDetected: true,
      verified: true,
      auditTrail: []
    });

    const sampleRooms: Room[] = [
      {
        ...INITIAL_ROOM_STATE,
        id: crypto.randomUUID(),
        roomName: 'Ground Floor Foyer & Entrance',
        buildingName: appState.siteInfo.name || 'Commercial Tower A',
        images: [],
        assets: [
          makeAsset(
            'Automatic Sliding Glass Doors',
            'Building Structural & Fabric,Automatic Doors',
            'Bi-parting optical sensor sliding doors with emergency breakout',
            'Fair',
            'Medium',
            '8500',
            '9 years',
            '3 years',
            'Guide roller wear detected on east portal'
          ),
          makeAsset(
            'Foyer Architectural LED Downlights',
            'Electrical Systems,Lighting',
            'Recessed high-output LED architectural downlights with DALI dimming',
            'Good',
            'Low',
            '3200',
            '4 years',
            '8 years'
          ),
          makeAsset(
            'Under-Ceiling Cassette Split AC',
            'HVAC & Refrigeration,Split AC',
            'Under-ceiling cassette split air conditioner unit',
            'Good',
            'Low',
            '5400',
            '5 years',
            '7 years'
          ),
          makeAsset(
            '4.5kg Dry Powder Fire Extinguisher',
            'Fire Systems,Fire Extinguishers',
            '4.5kg ABE dry chemical powder extinguisher with maintenance tag',
            'Excellent',
            'Low',
            '450',
            '1 year',
            '9 years'
          )
        ]
      },
      {
        ...INITIAL_ROOM_STATE,
        id: crypto.randomUUID(),
        roomName: 'Basement Central Plant & Boiler Room',
        buildingName: appState.siteInfo.name || 'Commercial Tower A',
        images: [],
        assets: [
          makeAsset(
            'Primary Hydronic Heating Boiler',
            'HVAC & Refrigeration,Boilers',
            'Natural gas condensing hydronic boiler unit with burner assembly',
            'Poor',
            'Extreme',
            '24000',
            '16 years',
            '0 years',
            'Severe heat exchanger corrosion, casing burn marks, safety relief dripping'
          ),
          makeAsset(
            'Primary Circulation Pumps (Pair)',
            'HVAC & Refrigeration,Pumps',
            'Twin base-mounted centrifugal heating water circulation pumps',
            'Poor',
            'High',
            '9500',
            '14 years',
            '1 year',
            'Bearing noise detected and mechanical seal weeping water onto base'
          ),
          makeAsset(
            'Main Low-Voltage Switchboard (MSB)',
            'Electrical Systems,Main Switchboard',
            'Floor-standing form 3b 1600A main switchboard with air circuit breakers',
            'Fair',
            'High',
            '35000',
            '18 years',
            '3 years',
            'Thermal hot spots identified on incoming busbar ties, arc chute aging'
          ),
          makeAsset(
            'Basement Sump Pump & Effluent Pit',
            'Plumbing Systems,Floor Wastes',
            'Dual submersible effluent stormwater pit pumps with float switches',
            'Fair',
            'Medium',
            '4200',
            '8 years',
            '2 years',
            'Impeller cavitation wear identified during wet well inspection'
          )
        ]
      },
      {
        ...INITIAL_ROOM_STATE,
        id: crypto.randomUUID(),
        roomName: 'Level 1 Data & Telecoms Server Room',
        buildingName: appState.siteInfo.name || 'Commercial Tower A',
        images: [],
        assets: [
          makeAsset(
            'Precision Computer Room AC (CRAC)',
            'HVAC & Refrigeration,Split AC',
            'In-row precision computer room air conditioning unit with EC fans',
            'Poor',
            'High',
            '18000',
            '12 years',
            '1 year',
            'Compressor 2 vibration fault; intermittent high temperature alarms logged'
          ),
          makeAsset(
            'Modular UPS Battery Bank (60kVA)',
            'Electrical Systems,UPS',
            'Online double-conversion uninterruptible power supply with sealed lead acid modules',
            'Fair',
            'High',
            '14500',
            '6 years',
            '1 year',
            'Battery string impedance tests show cell degradation'
          ),
          makeAsset(
            'FM-200 Clean Agent Fire Suppression',
            'Fire Systems,Gas Suppression System',
            'Gaseous total flooding fire extinguishing system cylinder & solenoids',
            'Excellent',
            'Low',
            '12000',
            '2 years',
            '15 years'
          ),
          makeAsset(
            'Biometric Access Control Reader',
            'Security Systems,Access Control Readers',
            'Smartcard RFID & capacitive biometric fingerprint reader',
            'Excellent',
            'Low',
            '1800',
            '2 years',
            '8 years'
          )
        ]
      },
      {
        ...INITIAL_ROOM_STATE,
        id: crypto.randomUUID(),
        roomName: 'Level 2 Executive Office Suite',
        buildingName: appState.siteInfo.name || 'Commercial Tower A',
        images: [],
        assets: [
          makeAsset(
            'Commercial Carpet Tile Flooring',
            'Building Structural & Fabric,Flooring',
            'Heavy duty commercial tufted nylon loop pile carpet tiles',
            'Good',
            'Low',
            '6400',
            '3 years',
            '7 years'
          ),
          makeAsset(
            'Acoustic Suspended Ceiling Grid',
            'Building Structural & Fabric,Ceiling',
            'Exposed tee suspended ceiling system with mineral fiber acoustic tiles',
            'Good',
            'Low',
            '5100',
            '3 years',
            '12 years'
          ),
          makeAsset(
            'VAV Air Terminal Diffusers',
            'HVAC & Refrigeration,Diffusers & Grilles',
            'Variable air volume swirl ceiling diffusers with electronic actuators',
            'Good',
            'Low',
            '4600',
            '4 years',
            '10 years'
          ),
          makeAsset(
            'Smart Dimmable LED Troffers',
            'Electrical Systems,Lighting',
            'Low-glare microprismatic LED office lighting with daylight harvesting',
            'Excellent',
            'Low',
            '7200',
            '2 years',
            '10 years'
          )
        ]
      },
      {
        ...INITIAL_ROOM_STATE,
        id: crypto.randomUUID(),
        roomName: 'Level 2 Staff Kitchen & Amenities',
        buildingName: appState.siteInfo.name || 'Commercial Tower A',
        images: [],
        assets: [
          makeAsset(
            'Commercial Under-Bench Boiling Unit',
            'Plumbing Systems,Hot Water Service',
            'Under-bench filtered boiling and chilled drinking water dispenser',
            'Fair',
            'Medium',
            '3800',
            '5 years',
            '2 years',
            'Descaling required; heating element cycling continuously'
          ),
          makeAsset(
            'Stainless Steel Double Bowl Sink & Mixer',
            'Plumbing Systems,Sinks & Basins',
            'Grade 304 stainless steel sink with swivel gooseneck lever mixer',
            'Good',
            'Low',
            '1500',
            '4 years',
            '8 years'
          ),
          makeAsset(
            'Restroom Exhaust Ventilation Fan',
            'HVAC & Refrigeration,Fans',
            'In-line centrifugal ducted exhaust fan with acoustic attenuator',
            'Average',
            'Low',
            '2200',
            '7 years',
            '4 years'
          ),
          makeAsset(
            'Dual Flush Wall-Hung Toilets & Cisterns',
            'Plumbing Systems,Toilets & Urinals',
            'Vitreous china wall-hung pans with in-wall pneumatic flush valves',
            'Good',
            'Low',
            '4800',
            '4 years',
            '9 years'
          )
        ]
      }
    ];

    setAppState(prev => {
      const updated = {
        ...prev,
        siteInfo: {
          ...prev.siteInfo,
          name: prev.siteInfo.name || 'Commercial Tower A',
          numRooms: sampleRooms.length
        },
        rooms: sampleRooms,
        view: 'health-dashboard' as const,
        currentRoomIndex: 0
      };
      firebaseService.saveState(updated.siteInfo, updated.rooms);
      return updated;
    });
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
                              // Separate checks for year and month to accurately capture past months in the same year
                              const isFutureMonth = 
                                entryDate.getFullYear() > month.getFullYear() || 
                                (entryDate.getFullYear() === month.getFullYear() && entryDate.getMonth() > month.getMonth());
                                
                              if (isFutureMonth) {
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

  const renderAppViews = () => (
      <>
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

              {/* COLLABORATION & MULTI-USER INDICATOR */}
              {effectiveIsOnline && viewMode === 'single' && appState.view !== 'welcome' && (
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl shadow-xs">
                      <div className="flex items-center -space-x-2">
                          {/* Active user (You) */}
                          <div 
                              onClick={() => setShowProfileModal(true)}
                              className={`relative w-8 h-8 rounded-full border-2 border-indigo-600 flex items-center justify-center text-xs font-bold cursor-pointer hover:scale-105 transition-transform ${getAvatarColor(inspectorProfile.email)}`}
                              title={`You: ${inspectorProfile.name} (${inspectorProfile.email}) - Click to customize`}
                          >
                              {getInitials(inspectorProfile.name, inspectorProfile.email)}
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white ${isEditingPresence ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                          </div>

                          {/* Other active inspectors */}
                          {activePresences.map((p) => (
                              <div 
                                  key={p.userId}
                                  className={`relative w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold group ${getAvatarColor(p.email)}`}
                              >
                                  {getInitials('', p.email)}
                                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white ${p.isEditing ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                                  
                                  {/* Sleek Tooltip */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 bg-slate-900 text-white text-[10px] p-2 rounded shadow-xl whitespace-nowrap text-left leading-normal">
                                      <p className="font-bold">{p.email}</p>
                                      <p className="text-slate-400">Status: {p.isEditing ? '🟢 Active Editor' : '⚪ Just Viewing'}</p>
                                      <p className="text-[8px] text-slate-500 font-mono mt-0.5 truncate max-w-[150px]">{p.device}</p>
                                  </div>
                              </div>
                          ))}
                      </div>
                      
                      <div className="hidden sm:block text-[10px] text-gray-500">
                          {activePresences.length === 0 ? (
                              <span className="text-green-600 font-medium flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Only you here
                              </span>
                          ) : (
                              <span className="text-indigo-600 font-bold">
                                  {activePresences.length + 1} Inspectors Active
                              </span>
                          )}
                      </div>
                  </div>
              )}

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

                  <button
                      onClick={() => setIsMobileMode(!isMobileMode)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm border ${
                          isMobileMode
                              ? 'bg-slate-900 text-white border-slate-700 ring-2 ring-indigo-500'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                      }`}
                      title={isMobileMode ? "Switch to standard desktop view" : "Switch to mobile handheld simulation mode"}
                  >
                      <span className="material-icons text-sm">{isMobileMode ? 'desktop_windows' : 'smartphone'}</span>
                      <span>{isMobileMode ? 'Desktop View' : 'Mobile View'}</span>
                  </button>
              </div>
          </header>

          {/* CONCURRENT EDIT / READ-ONLY LOCK BANNER */}
          {effectiveIsOnline && viewMode === 'single' && !hasEditLock && (
              <div className="bg-red-50 border-2 border-red-200 text-red-900 p-4 rounded-xl mb-6 shadow-md flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center shrink-0 animate-pulse">
                          <span className="material-icons">lock</span>
                      </div>
                      <div>
                          <p className="font-bold text-sm">🔒 Read-Only Mode: Concurrent Editor Active</p>
                          <p className="text-xs text-gray-600">
                              Another inspector ({activePresences.find(p => p.isEditing)?.email || 'another user'}) is currently editing this site.
                              Your inputs are locked to prevent overwrite conflicts.
                          </p>
                      </div>
                  </div>
                  <button 
                      onClick={() => {
                          setIsEditingPresence(true);
                          if (currentInspectionId) {
                              firebaseService.updatePresence(currentInspectionId, inspectorProfile.userId, inspectorProfile.email, true);
                          }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition transform active:scale-95 flex items-center gap-1.5"
                  >
                      <span className="material-icons text-sm">lock_open</span> Claim Edit Lock
                  </button>
              </div>
          )}

          {viewMode === 'portfolio' ? (
              <PortfolioView
                  portfolioData={portfolioData}
                  portfolioSearch={portfolioSearch}
                  setPortfolioSearch={setPortfolioSearch}
                  portfolioStatusFilter={portfolioStatusFilter}
                  setPortfolioStatusFilter={setPortfolioStatusFilter}
                  selectedMapSiteId={selectedMapSiteId}
                  setSelectedMapSiteId={setSelectedMapSiteId}
                  mapLayerType={mapLayerType}
                  setMapLayerType={setMapLayerType}
                  openInspection={openInspection}
                  riskChartData={riskChartData}
                  pendingQueueCount={pendingQueueCount}
                  syncMessage={syncMessage}
                  syncingOfflineData={syncingOfflineData}
                  setSyncingOfflineData={setSyncingOfflineData}
                  setSyncMessage={setSyncMessage}
                  setPendingQueueCount={setPendingQueueCount}
                  setPortfolioData={setPortfolioData}
                  effectiveIsOnline={effectiveIsOnline}
                  activePresences={activePresences}
                  hasEditLock={hasEditLock}
                  isEditingPresence={isEditingPresence}
                  setIsEditingPresence={setIsEditingPresence}
                  currentInspectionId={currentInspectionId}
                  inspectorProfile={inspectorProfile}
              />
          ) : (
              <>
                  {appState.view !== 'welcome' && (
                      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg p-1.5 mb-6 flex flex-wrap md:flex-nowrap gap-1.5 border border-slate-200 max-w-4xl mx-auto items-center justify-center">
                          <button
                              onClick={() => setAppState(prev => ({ ...prev, view: 'welcome' }))}
                              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-gray-600 hover:bg-slate-50 hover:text-indigo-600"
                              title="Go back to Site details & Setup"
                          >
                              <span className="material-icons text-sm text-slate-500">arrow_back</span>
                              Site Setup
                          </button>
                          <button
                              onClick={() => setAppState(prev => ({ ...prev, view: 'assessment' }))}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                  appState.view === 'assessment'
                                      ? 'bg-indigo-600 text-white shadow'
                                      : 'text-gray-600 hover:bg-slate-50'
                              }`}
                          >
                              <span className="material-icons text-sm">assignment</span>
                              Asset Assessment
                          </button>
                          <button
                              onClick={() => setAppState(prev => ({ ...prev, view: 'reconstruction' }))}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                  appState.view === 'reconstruction'
                                      ? 'bg-indigo-600 text-white shadow'
                                      : 'text-gray-600 hover:bg-slate-50'
                              }`}
                          >
                              <span className="material-icons text-sm">architecture</span>
                              Layout Recreator
                          </button>
                          <button
                              onClick={() => setAppState(prev => ({ ...prev, view: 'ai-agent-os' }))}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                  appState.view === 'ai-agent-os'
                                      ? 'bg-indigo-600 text-white shadow'
                                      : 'text-gray-600 hover:bg-slate-50'
                              }`}
                          >
                              <span className="material-icons text-sm">psychology</span>
                              AI Agent OS
                          </button>
                          <button
                              onClick={() => setAppState(prev => ({ ...prev, view: 'health-dashboard' }))}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                  appState.view === 'health-dashboard'
                                      ? 'bg-indigo-600 text-white shadow'
                                      : 'text-gray-600 hover:bg-slate-50'
                              }`}
                          >
                              <span className="material-icons text-sm">monitor_heart</span>
                              Health Dashboard
                          </button>
                          <button
                              onClick={() => setAppState(prev => ({ ...prev, view: 'summary' }))}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                  appState.view === 'summary'
                                      ? 'bg-indigo-600 text-white shadow'
                                      : 'text-gray-600 hover:bg-slate-50'
                              }`}
                          >
                              <span className="material-icons text-sm">summarize</span>
                              Summary
                          </button>
                      </div>
                  )}

                  {appState.view === 'welcome' && (
                      <WelcomeView
                          siteInfo={appState.siteInfo}
                          handleSiteInfoChange={handleSiteInfoChange}
                          addressSuggestions={addressSuggestions}
                          showSuggestions={showSuggestions}
                          setShowSuggestions={setShowSuggestions}
                          isSearchingAddress={isSearchingAddress}
                          addressError={addressError}
                          detectLocation={detectLocation}
                          handleAddressInputChange={handleAddressInputChange}
                          handleSelectSuggestion={handleSelectSuggestion}
                          handleDocumentUpload={handleDocumentUpload}
                          handleVendorRegisterUpload={handleVendorRegisterUpload}
                          startAssessment={startAssessment}
                          loadDemo={loadDemo}
                          setAppState={setAppState}
                      />
                  )}

                  {appState.view === 'assessment' && currentRoom && (
                      <RoomAssessmentView
                          currentRoomIndex={appState.currentRoomIndex}
                          rooms={appState.rooms}
                          currentRoom={currentRoom}
                          goToPrevPage={goToPrevPage}
                          goToNextPage={goToNextPage}
                          updateCurrentRoom={updateCurrentRoom}
                          handleImageUpload={handleImageUpload}
                          generateAssetsWithAI={generateAssetsWithAI}
                          processing={processing}
                          updateAsset={updateAsset}
                          setEditingAsset={setEditingAsset}
                          batchMode={batchMode}
                          toggleBatchMode={toggleBatchMode}
                          selectedAssetIds={selectedAssetIds}
                          toggleAssetSelection={toggleAssetSelection}
                          batchAction={batchAction}
                          setPreviewImage={setPreviewImage}
                          hasEditLock={hasEditLock}
                      />
                  )}

                  {appState.view === 'reconstruction' && (
                      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
                          <ArchitecturalReconstruction
                              siteInfo={appState.siteInfo}
                              rooms={appState.rooms}
                              onUpdateSiteInfo={(key, value) => {
                                  setAppState(prev => {
                                      const updatedSiteInfo = { ...prev.siteInfo, [key]: value };
                                      firebaseService.saveState(updatedSiteInfo, prev.rooms);
                                      return { ...prev, siteInfo: updatedSiteInfo };
                                  });
                              }}
                              onSave={saveGlobalState}
                              hasEditLock={hasEditLock}
                          />
                      </div>
                  )}

                  {appState.view === 'ai-agent-os' && (
                      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
                          <AIAgentOS
                              siteInfo={appState.siteInfo}
                              rooms={appState.rooms}
                              onUpdateSiteInfo={(key, value) => {
                                  setAppState(prev => {
                                      const updatedSiteInfo = { ...prev.siteInfo, [key]: value };
                                      firebaseService.saveState(updatedSiteInfo, prev.rooms);
                                      return { ...prev, siteInfo: updatedSiteInfo };
                                  });
                              }}
                              onUpdateRooms={(updatedRooms) => {
                                  setAppState(prev => {
                                      firebaseService.saveState(prev.siteInfo, updatedRooms);
                                      return { ...prev, rooms: updatedRooms };
                                  });
                              }}
                              onSave={saveGlobalState}
                              hasEditLock={hasEditLock}
                          />
                      </div>
                  )}

                  {appState.view === 'summary' && (
                      <AssessmentSummaryView
                          siteInfo={appState.siteInfo}
                          rooms={appState.rooms}
                          currentAssessmentRiskDistribution={currentAssessmentRiskDistribution}
                          handleSiteInfoChange={handleSiteInfoChange}
                          saveGlobalState={saveGlobalState}
                          exportToExcel={exportToExcel}
                          exportToCSV={exportToCSV}
                          exportToPDF={exportToPDF}
                          exportToJSON={exportToJSON}
                          exportForRAG={exportForRAG}
                          setAppState={setAppState}
                          handleReset={handleReset}
                      />
                  )}

                  {appState.view === 'health-dashboard' && (
                      <HealthDashboardView
                          siteInfo={appState.siteInfo}
                          rooms={appState.rooms}
                          onSelectRoom={(roomIndex) => {
                              setAppState(prev => ({
                                  ...prev,
                                  currentRoomIndex: roomIndex,
                                  view: 'assessment'
                              }));
                          }}
                          onPopulateSampleData={populateSampleBuildingData}
                          hasEditLock={hasEditLock}
                      />
                  )}
              </>
          )}
      </>
  );

  return (
    <div className={`min-h-screen ${isMobileMode ? 'bg-slate-950' : 'bg-gradient-to-br from-[#667eea] to-[#764ba2]'} text-gray-900 pb-20 font-sans`}>
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

      {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center bg-indigo-50">
                      <h3 className="text-lg font-bold text-indigo-800 flex items-center gap-2">
                          <span className="material-icons">account_circle</span> Customize Inspector Profile
                      </h3>
                      <button onClick={() => setShowProfileModal(false)} className="text-gray-500 hover:text-gray-700">
                          <span className="material-icons">close</span>
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <p className="text-xs text-gray-500">
                          Change your name and email to simulate real-time multi-inspector collaboration across different browser tabs.
                      </p>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Inspector Name</label>
                          <input 
                              type="text"
                              value={inspectorProfile.name}
                              onChange={(e) => {
                                  const updated = { ...inspectorProfile, name: e.target.value };
                                  setInspectorProfile(updated);
                                  localStorage.setItem('inspector_profile', JSON.stringify(updated));
                              }}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-black"
                              placeholder="e.g. Inspector John"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Inspector Email</label>
                          <input 
                              type="email"
                              value={inspectorProfile.email}
                              onChange={(e) => {
                                  const updated = { ...inspectorProfile, email: e.target.value };
                                  setInspectorProfile(updated);
                                  localStorage.setItem('inspector_profile', JSON.stringify(updated));
                              }}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-black"
                              placeholder="e.g. john@company.com"
                          />
                      </div>
                  </div>
                  <div className="p-4 border-t bg-gray-50 flex justify-end">
                      <button 
                          onClick={() => {
                              setShowProfileModal(false);
                              if (currentInspectionId && effectiveIsOnline) {
                                  firebaseService.updatePresence(currentInspectionId, inspectorProfile.userId, inspectorProfile.email, isEditingPresence);
                              }
                          }}
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow text-xs"
                      >
                          Done
                      </button>
                  </div>
              </div>
          </div>
      )}

      {editingAsset && currentRoom && (
          <EditAssetModal
              editingAsset={editingAsset}
              setEditingAsset={setEditingAsset}
              currentRoom={currentRoom}
              setPreviewImage={setPreviewImage}
              saveEditedAsset={saveEditedAsset}
          />
      )}

      {isMobileMode ? (
          <MobileAppFrame
              onExitMobileMode={() => setIsMobileMode(false)}
              currentView={appState.view}
              viewMode={viewMode}
              onNavigate={(view) => setAppState(prev => ({ ...prev, view: view as any }))}
              onTogglePortfolio={loadPortfolio}
          >
              <div className="w-full p-2 sm:p-4 flex flex-col flex-1">
                  {renderAppViews()}
              </div>
          </MobileAppFrame>
      ) : (
          <div className="max-w-7xl mx-auto p-4 md:p-6 min-h-screen flex flex-col">
              {renderAppViews()}
          </div>
      )}

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

