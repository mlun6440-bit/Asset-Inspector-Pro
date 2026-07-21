import React from 'react';
import { Room } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { firebaseService } from '../services/firebaseService';

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
  activePresences,
  hasEditLock,
  isEditingPresence,
  setIsEditingPresence,
  currentInspectionId,
  inspectorProfile,
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
                  className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 w-full sm:w-64 text-sm text-black"
                  value={portfolioSearch}
                  onChange={e => setPortfolioSearch(e.target.value)}
                />
              </div>
              <select 
                className="border rounded-lg px-4 py-2 bg-gray-50 text-sm focus:ring-2 focus:ring-indigo-500 text-black"
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
                        <div className="font-bold text-gray-900 text-sm text-left">{title}</div>
                        <div className="text-[11px] text-gray-500 text-left">{site.siteInfo?.address}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 text-left">
                          Updated: {site.lastUpdated ? new Date(site.lastUpdated).toLocaleDateString() : 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-gray-600 text-left">
                        {projectId}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openInspection(site);
                          }}
                          className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition whitespace-nowrap"
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
              <span className="material-icons text-xs">explore</span>
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
              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl flex flex-col gap-2 text-left">
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
                    <div className="text-sm font-extrabold text-red-650">{extremeCount}</div>
                  </div>
                  <div className="bg-white p-1 rounded border border-orange-100 flex flex-col justify-center">
                    <div className="text-[9px] text-orange-400 font-medium leading-none mb-1">High</div>
                    <div className="text-sm font-extrabold text-orange-655">{highCount}</div>
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
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full text-left">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="material-icons text-red-600">warning</span> 
          Risk Analysis Dashboard
        </h2>
        <p className="text-gray-650 mb-6 text-sm">
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
        
        <div className="overflow-x-auto rounded-lg border border-gray-200">
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
                        <td className="px-4 py-3 font-medium text-gray-900 text-left">{site.siteInfo?.name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-gray-600 text-left">{room.roomName}</td>
                        <td className="px-4 py-3 text-gray-600 text-left">{asset.category}</td>
                        <td className="px-4 py-3 text-gray-600 text-left">{asset.description}</td>
                        <td className="px-4 py-3 text-left">
                          <span className={`px-2 py-1 rounded text-xs font-bold text-white ${asset.riskRating === 'Extreme' ? 'bg-red-600' : 'bg-orange-500'}`}>
                            {asset.riskRating}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-left">{asset.condition}</td>
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
  );
};
