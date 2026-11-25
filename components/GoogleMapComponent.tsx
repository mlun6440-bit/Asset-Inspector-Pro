// Internal Usage Attribution ID: gmp_mcp_codeassist_v1_aistudio
// Maps JS API React Wrapper: https://visgl.github.io/react-google-maps/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import {
  getGoogleMapsApiKey,
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
const MapCameraController: React.FC<{ center?: { lat: number; lng: number }; zoom?: number }> = ({
  center,
  zoom,
}) => {
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

// Monitors Maps JavaScript API loading and auth failure state inside APIProvider
const MapStatusWatcher: React.FC<{ onAuthError: (reason: string) => void }> = ({ onAuthError }) => {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      onAuthError(
        'Google Maps authentication failed. Verify that Maps JavaScript API is enabled and your API key is valid.'
      );
    } else if (status === APILoadingStatus.FAILED) {
      onAuthError('Unable to load Google Maps. Please check your network connection or API configuration.');
    }
  }, [status, onAuthError]);

  return null;
};

export const GoogleMapComponent: React.FC<GoogleMapComponentProps> = ({
  center = { lat: -33.8568, lng: 151.2153 },
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
  const apiKey = useMemo(() => getGoogleMapsApiKey(), []);
  const [mapError, setMapError] = useState<string | null>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [internalCenter, setInternalCenter] = useState<{ lat: number; lng: number }>(center);
  const [internalMapType, setInternalMapType] = useState<string>(mapType);
  const [isGeocodingPin, setIsGeocodingPin] = useState<boolean>(false);

  // Synchronize internal center with external prop
  useEffect(() => {
    if (
      center &&
      Number.isFinite(center.lat) &&
      Number.isFinite(center.lng) &&
      (center.lat !== internalCenter.lat || center.lng !== internalCenter.lng)
    ) {
      setInternalCenter(center);
    }
  }, [center?.lat, center?.lng]);

  useEffect(() => {
    setInternalMapType(mapType);
  }, [mapType]);

  // Listen for global Google Maps auth failure callback (e.g. ApiProjectMapError / InvalidKeyMapError)
  useEffect(() => {
    if (!apiKey) return;
    const prevHandler = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      setMapError(
        'Google Maps JavaScript API reported an authorization or project activation error. Ensure the Maps JavaScript API is enabled for your configured Google Cloud project.'
      );
      if (typeof prevHandler === 'function') {
        prevHandler();
      }
    };
    return () => {
      (window as any).gm_authFailure = prevHandler;
    };
  }, [apiKey]);

  const handleMarkerDragEnd = useCallback(
    async (e: any) => {
      if (!e.latLng || !onLocationChange) return;
      const newLat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat;
      const newLng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng;
      if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return;
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
        console.warn('Failed to reverse geocode dragged marker:', err);
        onLocationChange({ lat: newLat, lng: newLng });
      } finally {
        setIsGeocodingPin(false);
      }
    },
    [onLocationChange]
  );

  const handleMapClick = useCallback(
    async (e: any) => {
      if (!isDraggableMarker || !onLocationChange) return;
      const latLng = e?.detail?.latLng || e?.latLng;
      if (!latLng) return;
      const newLat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
      const newLng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
      if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return;
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
        console.warn('Failed to reverse geocode clicked map point:', err);
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

  const canRenderInteractiveMap = Boolean(apiKey) && !mapError;

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-700/60 shadow-xl bg-slate-950 ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height, minHeight: '260px' }}
    >
      {/* Top Map Layer & External Navigation Bar */}
      {showControls && (
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2">
          {/* Layer switcher (shown when live interactive map is active) */}
          {canRenderInteractiveMap ? (
            <div className="flex bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
              <button
                type="button"
                onClick={() => setInternalMapType('roadmap')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
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
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
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
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  internalMapType === 'hybrid'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Hybrid
              </button>
            </div>
          ) : (
            <div className="bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/80 text-[10px] font-semibold text-slate-300 pointer-events-auto flex items-center gap-1.5">
              <span className="material-icons text-xs text-indigo-400">public</span>
              <span>GIS Coordinate View</span>
            </div>
          )}

          {/* Status & External Google Maps link */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {isGeocodingPin && (
              <div className="bg-slate-900/90 backdrop-blur border border-indigo-500/40 text-indigo-300 text-[10px] px-2.5 py-1 rounded-xl shadow-lg flex items-center gap-1.5 font-medium">
                <svg className="animate-spin h-3 w-3 text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Resolving Address...
              </div>
            )}

            <a
              href={getGoogleMapsNavigationUrl(internalCenter)}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-900/90 backdrop-blur border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-[10px] px-2.5 py-1 rounded-xl shadow-lg flex items-center gap-1 transition"
              title="Open Location in Google Maps"
            >
              <span className="material-icons text-xs text-indigo-400">open_in_new</span>
              <span>Google Maps</span>
            </a>
          </div>
        </div>
      )}

      {/* Main Google Maps Render Container — ONLY mounted when a valid API key is present */}
      {canRenderInteractiveMap ? (
        <APIProvider
          apiKey={apiKey}
          libraries={['places', 'marker', 'core']}
          language="en"
          region="AU"
          onError={() =>
            setMapError(
              'Unable to initialize Google Maps JavaScript API. Verify that the Maps JavaScript API is activated on your configured Google Cloud project.'
            )
          }
        >
          <MapStatusWatcher onAuthError={setMapError} />
          <GoogleMap
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
                    setActiveMarkerId(site.id);
                    if (onSelectSite) onSelectSite(site.id);
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
                      <span
                        className={`font-bold ${
                          activeSite.riskRating === 'Extreme' || activeSite.riskRating === 'High'
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                        }`}
                      >
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
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg shadow transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span className="material-icons text-xs">arrow_forward</span>
                      <span>View Inspection</span>
                    </button>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>
      ) : (
        /* Graceful fallback when Google Maps API key is not provisioned or project activation failed */
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 relative">
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.4) 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="relative z-10 max-w-md space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
              <span className="material-icons text-2xl">{mapError ? 'error_outline' : 'satellite_alt'}</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100">
                {mapError ? 'Interactive Map Unavailable' : 'Google Maps Platform Ready to Enable'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {mapError ||
                  'Enable Google Maps Platform in the Settings panel or configure VITE_GOOGLE_MAPS_API_KEY to activate live satellite imagery and interactive site pins.'}
              </p>
            </div>

            {sites.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 max-h-24 overflow-y-auto">
                {sites.slice(0, 6).map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => onSelectSite?.(site.id)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-[11px] text-slate-200 transition cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-icons text-xs text-indigo-400">location_on</span>
                    <span className="truncate max-w-[140px]">{site.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-1">
              <a
                href={getGoogleMapsNavigationUrl(internalCenter)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md"
              >
                <span className="material-icons text-sm">map</span>
                <span>Open Coordinates in Google Maps</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* GIS HUD Coordinates at bottom left */}
      <div className="absolute bottom-2.5 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 shadow-lg flex items-center gap-3">
        <div className="flex items-center gap-1 text-emerald-400">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
          <span className="font-bold">GPS ACTIVE</span>
        </div>
        <div className="text-slate-400">
          <span>LAT: {internalCenter.lat.toFixed(5)}</span> |{' '}
          <span>LNG: {internalCenter.lng.toFixed(5)}</span>
        </div>
        {canRenderInteractiveMap && isDraggableMarker && (
          <div className="hidden sm:inline-block text-[9px] text-indigo-300 font-sans border-l border-slate-700 pl-2">
            Click or drag marker to calibrate facility coordinates
          </div>
        )}
      </div>
    </div>
  );
};
