import React, { useMemo } from 'react';
import { Room } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { firebaseService } from '../services/firebaseService';
import { GoogleMapComponent, MapSiteMarker } from './GoogleMapComponent';
import { getGoogleMapsNavigationUrl } from '../services/googleMapsService';

interface PortfolioViewProps {
  portfolioData: any[];
  portfolioSearch: string;
  setPortfolioSearch: (val: string) => void;
  portfolioStatusFilter: string;
  setPortfolioStatusFilter: (val: string) => void;
  selectedMapSiteId: string | null;
  setSelectedMapSiteId: (id: string | null) => void;
  mapLayerType: 'streets' | 'satellite' | 'cadastral';
  setMapLayerType: (layer: 'streets' | 'satellite' | 'cadastral') => void;
  openInspection: (site: any) => void;
  riskChartData: any[];
  pendingQueueCount: number;
  syncMessage: string;
  syncingOfflineData: boolean;
  setSyncingOfflineData: (val: boolean) => void;
  setSyncMessage: (val: string) => void;
  setPendingQueueCount: (val: number) => void;
  setPortfolioData: (val: any[]) => void;
  effectiveIsOnline: boolean;
  activePresences: any[];
  hasEditLock: boolean;
  isEditingPresence: boolean;
  setIsEditingPresence: (val: boolean) => void;
  currentInspectionId: string | null;
  inspectorProfile: { userId: string; email: string; name: string };
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  portfolioData,
  portfolioSearch,
  setPortfolioSearch,
  portfolioStatusFilter,
  setPortfolioStatusFilter,
  selectedMapSiteId,
  setSelectedMapSiteId,
  mapLayerType,
  setMapLayerType,
  openInspection,
  riskChartData,
  pendingQueueCount,
  syncMessage,
  syncingOfflineData,
  setSyncingOfflineData,
  setSyncMessage,
  setPendingQueueCount,
  setPortfolioData,
  effectiveIsOnline,
}) => {
  // Filter portfolio inspections
  const filteredPortfolio = portfolioData.filter(site => {
    const title = site.siteInfo?.name || '';
    const address = site.siteInfo?.address || '';
    const matchesSearch = title.toLowerCase().includes(portfolioSearch.toLowerCase()) ||
                          address.toLowerCase().includes(portfolioSearch.toLowerCase());
    
    if (portfolioStatusFilter === 'All') return matchesSearch;
    
    const isComplete = site.rooms?.every((r: any) => r.assets?.length > 0) ?? false;
    const statusText = isComplete ? 'Complete' : 'In Progress';
    return matchesSearch && statusText === portfolioStatusFilter;
  });

  // Convert portfolio data into Google Map markers
  const mapMarkers: MapSiteMarker[] = useMemo(() => {
    return portfolioData.map(site => {
      const siteId = site.id || (site.siteInfo?.name || '').trim().replace(/\s+/g, '_').toLowerCase();
      const numRooms = site.rooms?.length || 0;
      const numAssets = site.rooms?.reduce((acc: number, r: any) => acc + (r.assets?.length || 0), 0) || 0;
      
      // Determine worst risk rating across assets
      let worstRisk = 'Low';
      const allAssets = site.rooms?.flatMap((r: any) => r.assets || []) || [];
      if (allAssets.some((a: any) => a.riskRating === 'Extreme')) {
        worstRisk = 'Extreme';
      } else if (allAssets.some((a: any) => a.riskRating === 'High')) {
        worstRisk = 'High';
      } else if (allAssets.some((a: any) => a.riskRating === 'Medium')) {
        worstRisk = 'Medium';
      }

      const isComplete = site.rooms?.every((r: any) => r.assets?.length > 0) ?? false;

      // Fallback default coordinates if not stored
      let lat = site.siteInfo?.latitude;
      let lng = site.siteInfo?.longitude;

      if (lat === undefined || lng === undefined) {
        if (siteId.includes('colombo')) {
          lat = 6.9497;
          lng = 79.8437;
        } else if (siteId.includes('sydney')) {
          lat = -33.8568;
          lng = 151.2153;
        } else if (siteId.includes('dubbo')) {
          lat = -32.2470;
          lng = 148.6008;
        } else {
          lat = -37.8101;
          lng = 144.9628;
        }
      }

      return {
        id: siteId,
        name: site.siteInfo?.name || 'Facility Site',
        address: site.siteInfo?.address || 'Site Location',
        latitude: lat,
        longitude: lng,
        riskRating: worstRisk,
        status: isComplete ? 'Complete' : 'In Progress',
        roomCount: numRooms,
        assetCount: numAssets,
      };
    });
  }, [portfolioData]);

  // Selected site for focused map view
  const selectedSite = useMemo(() => {
    return portfolioData.find(s => {
      const siteId = s.id || (s.siteInfo?.name || '').trim().replace(/\s+/g, '_').toLowerCase();
      return siteId === selectedMapSiteId;
    }) || portfolioData[0];
  }, [portfolioData, selectedMapSiteId]);

  const selectedMarker = useMemo(() => {
    return mapMarkers.find(m => m.id === selectedMapSiteId) || mapMarkers[0];
  }, [mapMarkers, selectedMapSiteId]);

  const mapCenter = useMemo(() => {
    if (selectedMarker) {
      return { lat: selectedMarker.latitude, lng: selectedMarker.longitude };
    }
    return { lat: -33.8568, lng: 151.2153 };
  }, [selectedMarker]);

  return (
    <div className="flex-1 p-4 animate-fade-in flex flex-col gap-6">
      
      {/* Realtime Connection Sync Queue Monitor Bar */}
      {pendingQueueCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse shadow-sm text-left">
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
                let synced = 0;
                try {
                  synced = await firebaseService.syncPendingQueue((p) => setSyncMessage(p));
                  const remaining = await firebaseService.getPendingQueueCount();
                  setPendingQueueCount(remaining);
                  const fresh = await firebaseService.getAllInspections();
                  setPortfolioData(fresh);
                } catch (err) {
                  console.error("Manual sync failed:", err);
                } finally {
                  setSyncingOfflineData(false);
                }
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
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-bounce shadow-sm text-left">
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
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span className="material-icons text-indigo-600">domain</span> 
              <span>Portfolio Asset Directory</span>
            </h2>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">search</span>
                <input 
                  type="text" 
                  placeholder="Search site, address..." 
                  className="pl-9 pr-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 w-full sm:w-56 text-xs text-black"
                  value={portfolioSearch}
                  onChange={e => setPortfolioSearch(e.target.value)}
                />
              </div>
              <select 
                className="border rounded-lg px-3 py-1.5 bg-gray-50 text-xs focus:ring-2 focus:ring-indigo-500 text-black"
                value={portfolioStatusFilter}
                onChange={e => setPortfolioStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Complete">Complete</option>
                <option value="In Progress">In Progress</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3.5 py-3">Status</th>
                  <th className="px-3.5 py-3">Title / Address</th>
                  <th className="px-3.5 py-3 text-center">GIS Pin</th>
                  <th className="px-3.5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPortfolio.length > 0 ? filteredPortfolio.map((site) => {
                  const siteId = site.id || (site.siteInfo?.name || '').trim().replace(/\s+/g, '_').toLowerCase();
                  const isSelected = selectedMapSiteId === siteId;
                  const isComplete = site.rooms?.every((r: any) => r.assets?.length > 0) ?? false;
                  const hasCoords = site.siteInfo?.latitude !== undefined && site.siteInfo?.longitude !== undefined;

                  return (
                    <tr 
                      key={siteId}
                      onClick={() => setSelectedMapSiteId(siteId)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/80 font-medium' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                          {isComplete ? 'Complete' : 'In Progress'}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="font-bold text-slate-900 truncate max-w-[200px]">{site.siteInfo?.name || 'Unnamed Site'}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[220px]">{site.siteInfo?.address || 'No address set'}</div>
                      </td>
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono px-2 py-0.5 rounded ${
                          hasCoords ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className="material-icons text-xs text-indigo-500">location_on</span>
                          <span>{hasCoords ? `${site.siteInfo.latitude.toFixed(2)}, ${site.siteInfo.longitude.toFixed(2)}` : 'Demo GIS'}</span>
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-right whitespace-nowrap">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInspection(site);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          {isComplete ? 'Review' : 'Open'}
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

        {/* Right: GIS Asset Locator Map using Google Maps Platform */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-xl p-5 border border-gray-100 flex flex-col gap-3.5 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-1.5">
              <span className="material-icons text-indigo-600 text-lg">map</span>
              <span>Google Maps Multi-Site GIS</span>
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full border border-slate-200">
              {mapMarkers.length} Sites Plotted
            </span>
          </div>

          {/* Interactive Google Map Component */}
          <div className="w-full">
            <GoogleMapComponent
              center={mapCenter}
              zoom={14}
              sites={mapMarkers}
              selectedSiteId={selectedMapSiteId}
              onSelectSite={(siteId) => {
                setSelectedMapSiteId(siteId);
                const targetSite = portfolioData.find(s => {
                  const id = s.id || (s.siteInfo?.name || '').trim().replace(/\s+/g, '_').toLowerCase();
                  return id === siteId;
                });
                if (targetSite) {
                  openInspection(targetSite);
                }
              }}
              mapType={mapLayerType === 'streets' ? 'roadmap' : 'satellite'}
              height="290px"
            />
          </div>

          {/* Selected Site Details Overlay Box */}
          {selectedSite && (
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col gap-2 text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-gray-950 text-xs sm:text-sm truncate">
                  {selectedSite.siteInfo?.name || 'Selected Property'}
                </div>
                <a
                  href={getGoogleMapsNavigationUrl(
                    selectedSite.siteInfo?.latitude && selectedSite.siteInfo?.longitude
                      ? { lat: selectedSite.siteInfo.latitude, lng: selectedSite.siteInfo.longitude }
                      : (selectedSite.siteInfo?.address || selectedSite.siteInfo?.name || '')
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 whitespace-nowrap"
                >
                  <span>Google Maps</span>
                  <span className="material-icons text-xs">open_in_new</span>
                </a>
              </div>

              {selectedSite.siteInfo?.address && (
                <div className="text-[11px] text-slate-600 line-clamp-1">
                  📍 {selectedSite.siteInfo.address}
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5 text-center mt-1">
                <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="text-[8px] text-slate-400 font-bold uppercase">Areas</div>
                  <div className="text-xs font-extrabold text-slate-800">{selectedSite.rooms?.length || 0}</div>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="text-[8px] text-slate-400 font-bold uppercase">Assets</div>
                  <div className="text-xs font-extrabold text-slate-800">
                    {selectedSite.rooms?.reduce((acc: number, r: any) => acc + (r.assets?.length || 0), 0) || 0}
                  </div>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-red-200 shadow-2xs">
                  <div className="text-[8px] text-red-500 font-bold uppercase">Extreme</div>
                  <div className="text-xs font-extrabold text-red-600">
                    {selectedSite.rooms?.reduce((acc: number, r: any) => acc + (r.assets?.filter((a: any) => a.riskRating === 'Extreme').length || 0), 0) || 0}
                  </div>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-amber-200 shadow-2xs">
                  <div className="text-[8px] text-amber-600 font-bold uppercase">High</div>
                  <div className="text-xs font-extrabold text-amber-600">
                    {selectedSite.rooms?.reduce((acc: number, r: any) => acc + (r.assets?.filter((a: any) => a.riskRating === 'High').length || 0), 0) || 0}
                  </div>
                </div>
              </div>

              <div className="mt-1">
                <button 
                  type="button"
                  onClick={() => openInspection(selectedSite)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <span className="material-icons text-sm">visibility</span>
                  <span>Inspect Selected Facility</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Risk Analysis Dashboard */}
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full text-left">
        <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          <span className="material-icons text-red-600">warning</span> 
          <span>Portfolio Risk Trend Analysis</span>
        </h2>
        <p className="text-gray-500 mb-6 text-xs">
          Aggregated view of high and extreme risk assets tracked across all regional facility locations.
        </p>

        <div className="mb-4 w-full h-60">
          {riskChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={riskChartData}>
                <defs>
                  <linearGradient id="colorExtreme" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 11 }} stroke="#64748B" />
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }} />
                <Area type="monotone" dataKey="Extreme" stroke="#dc2626" fillOpacity={1} fill="url(#colorExtreme)" />
                <Area type="monotone" dataKey="High" stroke="#ea580c" fillOpacity={1} fill="url(#colorHigh)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed">
              No historical risk trajectory data logged yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
