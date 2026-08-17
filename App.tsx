
// Updated Live Sync Configuration
import React, { useState, useEffect, useMemo } from 'react';
import { SiteInfo, Room, AppState, Asset, ChatMessage, AuditEntry } from './types';
import { firebaseService } from './services/firebaseService';
import { detectAssetsWithBoundingBoxes, cropImage, summarizeConversation, analyzeDocument, extractAssetsFromVendorRegister } from './services/geminiService';
import { usePresenceSession } from './hooks/usePresenceSession';
import { ChatBot } from './components/ChatBot';
import { ArchitecturalReconstruction } from './components/ArchitecturalReconstruction';
import { WelcomeView } from './components/WelcomeView';
import { PortfolioView } from './components/PortfolioView';
import { RoomAssessmentView } from './components/RoomAssessmentView';
import { AssessmentSummaryView } from './components/AssessmentSummaryView';
import { AIAgentOS } from './components/AIAgentOS';
import { EditAssetModal } from './components/EditAssetModal';
import { format, subMonths, startOfMonth, eachMonthOfInterval, isSameMonth, parseISO } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

import { ASSET_CATEGORIES, CONDITION_OPTIONS, RISK_OPTIONS, RISK_COLORS, INITIAL_ROOM_STATE } from './constants';

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

  const updateCurrentRoom = (updates: Partial<Room>) => {
    if (!hasEditLock) return;
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
      const newImages = await Promise.all(
        files.map(file => {
          return new Promise<{ id: string; dataUrl: string; name: string; timestamp: number }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
            reader.onload = (event) => {
              const result = event.target?.result as string;
              if (!result) {
                reject(new Error("Empty image file payload"));
                return;
              }

              // Compress & downscale large photos for high speed and minimal RAM usage
              const img = new Image();
              img.onerror = () => {
                // If canvas decoding fails, fallback to raw data URL
                resolve({
                  id: crypto.randomUUID(),
                  dataUrl: result,
                  name: file.name,
                  timestamp: Date.now()
                });
              };
              img.onload = () => {
                const MAX_DIM = 1600;
                let width = img.width;
                let height = img.height;

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
                canvas.width = width;
                canvas.height = height;
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

                ctx.drawImage(img, 0, 0, width, height);
                const compressed = canvas.toDataURL('image/jpeg', 0.85);
                resolve({
                  id: crypto.randomUUID(),
                  dataUrl: compressed,
                  name: file.name,
                  timestamp: Date.now()
                });
              };
              img.src = result;
            };
            reader.readAsDataURL(file);
          });
        })
      );

      const updatedImages = [...currentRoom.images, ...newImages];
      updateCurrentRoom({ images: updatedImages });
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
    if (!hasEditLock) return;
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
               if (sourceImg && sourceImg.dataUrl) {
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
                          </div>                           <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description</label>
                              <textarea 
                                  value={editingAsset.description}
                                  onChange={(e) => setEditingAsset({...editingAsset, description: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-20 text-slate-800 bg-white"
                                  placeholder="Detailed description..."
                              />
                          </div>

                          <div className="grid grid-cols-4 gap-3">
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Condition</label>
                                  <select 
                                      value={editingAsset.condition}
                                      onChange={(e) => setEditingAsset({...editingAsset, condition: e.target.value})}
                                      className="w-full px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-xs text-slate-800"
                                  >
                                      {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Risk Rating</label>
                                  <select 
                                      value={editingAsset.riskRating || 'Low'}
                                      onChange={(e) => setEditingAsset({...editingAsset, riskRating: e.target.value})}
                                      className="w-full px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-xs text-slate-800"
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
                                      className="w-full px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs text-slate-800 bg-white"
                                      placeholder="e.g. 15"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Quantity</label>
                                  <input 
                                      type="text"
                                      value={editingAsset.quantity}
                                      onChange={(e) => setEditingAsset({...editingAsset, quantity: e.target.value})}
                                      className="w-full px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs text-slate-800 bg-white"
                                  />
                              </div>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Justification</label>
                              <textarea 
                                  value={editingAsset.justification}
                                  onChange={(e) => setEditingAsset({...editingAsset, justification: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-16 text-slate-800 bg-white"
                                  placeholder="Why is it in this condition?"
                              />
                          </div>
                          
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Notes (Inspector Observations)</label>
                              <textarea 
                                  value={editingAsset.notes || ''}
                                  onChange={(e) => setEditingAsset({...editingAsset, notes: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-16 bg-yellow-50 text-slate-800"
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
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">RUL (Years)</label>
                                  <input 
                                      type="text"
                                      value={editingAsset.rul}
                                      onChange={(e) => setEditingAsset({...editingAsset, rul: e.target.value})}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
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
