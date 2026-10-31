// Source: Google Maps Platform Code Assist
// Internal Usage Attribution ID: gmp_mcp_codeassist_v1_aistudio

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  getGoogleMapsApiKey,
  setCustomGoogleMapsApiKey,
  GMP_ATTRIBUTION_ID,
  reverseGeocodeGoogle,
  getGoogleMapsNavigationUrl,
} from '../services/googleMapsService';

export interface MapSiteMarker {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  riskRating?: string;
  status?: 'Complete' | 'In Progress' | 'Draft';
  roomCount?: number;
  assetCount?: number;
  totalCost?: string | number;
}

interface GoogleMapComponentProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  sites?: MapSiteMarker[];
  selectedSiteId?: string | null;
  onSelectSite?: (siteId: string) => void;
  onLocationChange?: (coords: { lat: number; lng: number; address?: string }) => void;
  isDraggableMarker?: boolean;
  mapType?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
  height?: string | number;
  className?: string;
  interactive?: boolean;
  showControls?: boolean;
}

// Controller component to smoothly pan/zoom camera when center changes
const MapCameraController: React.FC<{ center?: { lat: number; lng: number }; zoom?: number }> = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !center) return;
    map.panTo(center);
    if (zoom !== undefined) {
      map.setZoom(zoom);
    }
  }, [map, center?.lat, center?.lng, zoom]);

  return null;
};

export const GoogleMapComponent: React.FC<GoogleMapComponentProps> = ({
  center = { lat: -33.8568, lng: 151.2153 }, // Default to Sydney Opera House
  zoom = 15,
  sites = [],
  selectedSiteId,
  onSelectSite,
  onLocationChange,
  isDraggableMarker = false,
  mapType = 'satellite',
  height = '360px',
  className = '',
  interactive = true,
  showControls = true,
}) => {
  const [apiKey, setApiKey] = useState<string>(() => getGoogleMapsApiKey());
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [customKeyInput, setCustomKeyInput] = useState<string>('');
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [internalCenter, setInternalCenter] = useState<{ lat: number; lng: number }>(center);
  const [internalMapType, setInternalMapType] = useState<string>(mapType);
  const [isGeocodingPin, setIsGeocodingPin] = useState<boolean>(false);

  // Synchronize internal center with external prop
  useEffect(() => {
    if (center && (center.lat !== internalCenter.lat || center.lng !== internalCenter.lng)) {
      setInternalCenter(center);
    }
  }, [center.lat, center.lng]);

  useEffect(() => {
    setInternalMapType(mapType);
  }, [mapType]);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (customKeyInput.trim()) {
      setCustomGoogleMapsApiKey(customKeyInput.trim());
      setApiKey(customKeyInput.trim());
      setShowKeyModal(false);
    }
  };

  const handleClearKey = () => {
    setCustomGoogleMapsApiKey('');
    setApiKey('');
    setCustomKeyInput('');
    setShowKeyModal(false);
  };

  const handleMarkerDragEnd = useCallback(
    async (e: any) => {
      if (!e.latLng || !onLocationChange) return;
      const newLat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat;
      const newLng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng;
      setInternalCenter({ lat: newLat, lng: newLng });

      setIsGeocodingPin(true);
      try {
        const geoResult = await reverseGeocodeGoogle(newLat, newLng);
        onLocationChange({
          lat: newLat,
          lng: newLng,
          address: geoResult?.formattedAddress,
        });
      } catch (err) {
        console.warn("Failed to reverse geocode dragged marker:", err);
        onLocationChange({ lat: newLat, lng: newLng });
      } finally {
        setIsGeocodingPin(false);
      }
    },
    [onLocationChange]
  );

  const handleMapClick = useCallback(
    async (e: any) => {
      if (!isDraggableMarker || !onLocationChange || !e.latLng) return;
      const newLat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat;
      const newLng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng;
      setInternalCenter({ lat: newLat, lng: newLng });

      setIsGeocodingPin(true);
      try {
        const geoResult = await reverseGeocodeGoogle(newLat, newLng);
        onLocationChange({
          lat: newLat,
          lng: newLng,
          address: geoResult?.formattedAddress,
        });
      } catch (err) {
        console.warn("Failed to reverse geocode clicked map point:", err);
        onLocationChange({ lat: newLat, lng: newLng });
      } finally {
        setIsGeocodingPin(false);
      }
    },
    [isDraggableMarker, onLocationChange]
  );

  // Determine active site for info window in multi-site mode
  const activeSite = useMemo(() => {
    if (!activeMarkerId && !selectedSiteId) return null;
    const targetId = activeMarkerId || selectedSiteId;
    return sites.find((s) => s.id === targetId) || null;
  }, [activeMarkerId, selectedSiteId, sites]);

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-700/60 shadow-xl bg-slate-950 ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height, minHeight: '260px' }}
    >
      {/* Top Map Layer & Key Configuration Bar */}
      {showControls && (
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2">
          {/* Layer switcher */}
          <div className="flex bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
            <button
              type="button"
              onClick={() => setInternalMapType('roadmap')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                internalMapType === 'roadmap'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Street
            </button>
            <button
              type="button"
              onClick={() => setInternalMapType('satellite')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                internalMapType === 'satellite'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setInternalMapType('hybrid')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                internalMapType === 'hybrid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Hybrid
            </button>
          </div>

          {/* Key status & external link */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {isGeocodingPin && (
              <div className="bg-slate-900/90 backdrop-blur border border-indigo-500/40 text-indigo-300 text-[10px] px-2.5 py-1 rounded-xl shadow-lg flex items-center gap-1.5 font-medium">
                <svg className="animate-spin h-3 w-3 text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Resolving Address...
              </div>
            )}

            <a
              href={getGoogleMapsNavigationUrl(internalCenter)}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-900/90 backdrop-blur border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-[10px] px-2.5 py-1 rounded-xl shadow-lg flex items-center gap-1 transition"
              title="Open Google Maps in New Window"
            >
              <span className="material-icons text-xs text-indigo-400">open_in_new</span>
              <span>Google Maps</span>
            </a>

            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className={`backdrop-blur border text-[10px] px-2.5 py-1 rounded-xl shadow-lg flex items-center gap-1 transition ${
                apiKey
                  ? 'bg-emerald-950/80 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/80'
                  : 'bg-indigo-950/80 border-indigo-600/50 text-indigo-300 hover:bg-indigo-900/80 animate-pulse'
              }`}
              title="Configure Google Maps Platform Key"
            >
              <span className="material-icons text-xs">
                {apiKey ? 'key' : 'vpn_key'}
              </span>
              <span>{apiKey ? 'Maps API Ready' : 'Configure Key'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Google Maps Render Container */}
      {/* Keyed by apiKey so saving a new key reloads the provider with it */}
      <APIProvider
        key={apiKey}
        apiKey={apiKey}
        libraries={['places', 'marker', 'geocoding', 'core']}
      >
        <Map
          defaultCenter={internalCenter}
          defaultZoom={zoom}
          mapId="DEMO_MAP_ID"
          mapTypeId={internalMapType}
          gestureHandling={interactive ? 'greedy' : 'none'}
          disableDefaultUI={!showControls}
          onClick={handleMapClick}
          internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
          className="w-full h-full"
        >
          <MapCameraController center={internalCenter} zoom={zoom} />

          {/* Single Site Pin Mode (Draggable or Static) */}
          {sites.length === 0 && (
            <AdvancedMarker
              position={internalCenter}
              draggable={isDraggableMarker}
              onDragEnd={handleMarkerDragEnd}
              title="Building Asset Location"
            >
              <Pin
                background="#4f46e5"
                borderColor="#ffffff"
                glyphColor="#ffffff"
                scale={1.15}
              />
            </AdvancedMarker>
          )}

          {/* Multi-Site Portfolio Markers */}
          {sites.map((site) => {
            const isSelected = selectedSiteId === site.id || activeMarkerId === site.id;
            const isHighRisk = site.riskRating === 'High' || site.riskRating === 'Extreme';
            const isMediumRisk = site.riskRating === 'Medium';
            const bgColor = isHighRisk ? '#f43f5e' : isMediumRisk ? '#f59e0b' : '#10b981';

            return (
              <AdvancedMarker
                key={site.id}
                position={{ lat: site.latitude, lng: site.longitude }}
                onClick={() => {
                  // Open the info window only; its "View Inspection" button navigates
                  setActiveMarkerId(site.id);
                }}
                title={site.name}
              >
                <div className="relative group cursor-pointer">
                  <Pin
                    background={bgColor}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    scale={isSelected ? 1.3 : 1.0}
                  />
                  {isSelected && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap border border-slate-700">
                      {site.name}
                    </div>
                  )}
                </div>
              </AdvancedMarker>
            );
          })}

          {/* InfoWindow for Active Portfolio Site */}
          {activeSite && (
            <InfoWindow
              position={{ lat: activeSite.latitude, lng: activeSite.longitude }}
              onCloseClick={() => setActiveMarkerId(null)}
            >
              <div className="p-1 max-w-xs text-slate-900 font-sans text-left">
                <div className="font-bold text-xs text-indigo-700 flex items-center gap-1 mb-0.5">
                  <span className="material-icons text-sm">apartment</span>
                  {activeSite.name}
                </div>
                {activeSite.address && (
                  <p className="text-[11px] text-slate-600 mb-2 leading-tight">
                    {activeSite.address}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-slate-100 p-1.5 rounded-lg border border-slate-200 mb-2">
                  <div>
                    <span className="text-slate-400 block text-[8px] uppercase font-bold">Status</span>
                    <span className="font-semibold">{activeSite.status || 'In Progress'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[8px] uppercase font-bold">Risk Level</span>
                    <span className={`font-bold ${
                      activeSite.riskRating === 'Extreme' || activeSite.riskRating === 'High' ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {activeSite.riskRating || 'Low'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[8px] uppercase font-bold">Rooms</span>
                    <span className="font-semibold">{activeSite.roomCount ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[8px] uppercase font-bold">Assets</span>
                    <span className="font-semibold">{activeSite.assetCount ?? 0}</span>
                  </div>
                </div>

                {onSelectSite && (
                  <button
                    type="button"
                    onClick={() => onSelectSite(activeSite.id)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg shadow transition flex items-center justify-center gap-1"
                  >
                    <span className="material-icons text-xs">arrow_forward</span>
                    <span>View Inspection</span>
                  </button>
                )}
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>

      {/* Draggable Notice / GIS HUD Coordinates at bottom left */}
      <div className="absolute bottom-2.5 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 shadow-lg flex items-center gap-3">
        <div className="flex items-center gap-1 text-emerald-400">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
          <span className="font-bold">GPS ACTIVE</span>
        </div>
        <div className="text-slate-400">
          <span>LAT: {internalCenter.lat.toFixed(5)}</span> | <span>LNG: {internalCenter.lng.toFixed(5)}</span>
        </div>
        {isDraggableMarker && (
          <div className="hidden sm:inline-block text-[9px] text-indigo-300 font-sans border-l border-slate-700 pl-2">
            💡 Click or drag marker to calibrate facility coordinates
          </div>
        )}
      </div>

      {/* API Key Configuration Modal */}
      {showKeyModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-left animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <span className="material-icons text-base">map</span>
                </div>
                <h3 className="text-sm font-bold text-white">Google Maps Platform Key</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              To activate real-time satellite imagery, address autocompletion, and geocoding services, provide your Google Maps Platform API key or generate a free zero-cost Demo Key.
            </p>

            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700 mb-4 text-xs">
              <span className="text-slate-400 block font-semibold mb-1">Quickstart Free Demo Key:</span>
              <a
                href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-medium underline flex items-center gap-1"
              >
                <span>Get a free Maps Demo Key (no billing required)</span>
                <span className="material-icons text-xs">open_in_new</span>
              </a>
            </div>

            <form onSubmit={handleSaveKey} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  API Key (Stored securely in browser session)
                </label>
                <input
                  type="password"
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleClearKey}
                  className="text-xs text-slate-400 hover:text-rose-400 transition"
                >
                  Reset Key
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition"
                  >
                    Save & Load Map
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
