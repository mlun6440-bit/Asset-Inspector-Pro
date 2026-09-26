import React from 'react';
import { SiteInfo, Room } from '../types';
import { RISK_OPTIONS, RISK_COLORS } from '../constants';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { GoogleMapComponent } from './GoogleMapComponent';
import { getGoogleMapsNavigationUrl } from '../services/googleMapsService';

interface AssessmentSummaryViewProps {
  siteInfo: SiteInfo;
  rooms: Room[];
  currentAssessmentRiskDistribution: {
    chartData: Array<{ name: string; value: number }>;
    totalAssets: number;
    counts: Record<string, number>;
  };
  handleSiteInfoChange: (key: keyof SiteInfo, value: any) => void;
  saveGlobalState: () => void;
  exportToExcel: () => void;
  exportToCSV: () => void;
  exportToPDF: () => void;
  exportToJSON: () => void;
  exportForRAG: () => void;
  setAppState: React.Dispatch<React.SetStateAction<any>>;
  handleReset: () => void;
}

export const AssessmentSummaryView: React.FC<AssessmentSummaryViewProps> = ({
  siteInfo,
  rooms,
  currentAssessmentRiskDistribution,
  handleSiteInfoChange,
  saveGlobalState,
  exportToExcel,
  exportToCSV,
  exportToPDF,
  exportToJSON,
  exportForRAG,
  setAppState,
  handleReset,
}) => {
  const mapCoords = {
    lat: siteInfo.latitude ?? -33.8568,
    lng: siteInfo.longitude ?? 151.2153,
  };

  return (
    <div className="flex-1 p-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-3xl w-full animate-fade-in-up">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-emerald-600 shadow-inner">
            <span className="material-icons text-3xl">task_alt</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Assessment Complete!</h2>
          <p className="text-xs text-gray-500 mt-1">Review verified facility location, risk profile, and export compliance reports.</p>
        </div>

        {/* Facility Geo-Location & Google Maps Card */}
        <div className="border border-slate-200 bg-slate-50/70 rounded-2xl p-5 mb-6 shadow-sm text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-icons text-indigo-600 text-base">place</span>
                Facility GIS & Google Maps Location
              </h3>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{siteInfo.name || 'Facility Site'}</p>
              <p className="text-xs text-slate-500">{siteInfo.address || 'Address unassigned'}</p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={getGoogleMapsNavigationUrl(
                  siteInfo.latitude && siteInfo.longitude
                    ? { lat: siteInfo.latitude, lng: siteInfo.longitude }
                    : (siteInfo.address || siteInfo.name || '')
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 shadow-2xs"
              >
                <span>Open in Google Maps</span>
                <span className="material-icons text-xs">open_in_new</span>
              </a>
            </div>
          </div>

          <GoogleMapComponent
            center={mapCoords}
            zoom={16}
            mapType="satellite"
            height="200px"
            interactive={true}
          />
        </div>

        {/* Real-time Asset Risk Distribution & Visual Health Report */}
        <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5 mb-6 shadow-sm">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-1.5 text-left">
            <span className="material-icons text-indigo-600 text-base">donut_large</span>
            Visual Health Report (Risk Profile)
          </h3>
          
          {currentAssessmentRiskDistribution.totalAssets === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              <span className="material-icons text-3xl mb-1 block">grid_view</span>
              No assets logged in this assessment yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Donut Chart with Centered Total Count */}
              <div className="relative flex items-center justify-center h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={currentAssessmentRiskDistribution.chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {currentAssessmentRiskDistribution.chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={RISK_COLORS[entry.name] || '#10B981'} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => [`${value} Asset(s)`, 'Count']}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Absolute Center Text */}
                <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-extrabold text-gray-800 leading-none">
                    {currentAssessmentRiskDistribution.totalAssets}
                  </span>
                  <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider mt-0.5">
                    Total Assets
                  </span>
                </div>
              </div>
              
              {/* Risk Distribution Details & Insight */}
              <div className="space-y-2.5">
                <div className="space-y-1">
                  {RISK_OPTIONS.map((risk: string) => { 
                    const count = (currentAssessmentRiskDistribution.counts as Record<string, number>)[risk] || 0;
                    const percent = currentAssessmentRiskDistribution.totalAssets > 0 
                      ? Math.round((count / currentAssessmentRiskDistribution.totalAssets) * 100) 
                      : 0;

                    return (
                      <div key={risk} className="flex items-center justify-between text-xs py-0.5">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full" 
                            style={{ backgroundColor: RISK_COLORS[risk] }}
                          />
                          <span className="font-medium text-gray-700">{risk}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 font-mono text-[10px]">{percent}%</span>
                          <span className="font-bold text-gray-800 w-6 text-right">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="bg-white border border-gray-200 rounded-xl p-2.5 shadow-2xs text-left">
                  <p className="text-[11px] leading-tight">
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

        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5 text-left">
            <span className="material-icons text-indigo-600 text-sm">assignment</span>
            Site Notes / Executive Summary
          </label>
          <textarea 
            className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500 h-32 text-xs leading-relaxed"
            placeholder="General observations, executive summary, or key recommendations..."
            value={siteInfo.notes || ''}
            onChange={(e) => handleSiteInfoChange('notes', e.target.value)}
            onBlur={saveGlobalState}
          />
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 mb-6 text-left">
          <h4 className="font-bold text-blue-800 mb-1 flex items-center gap-1.5 text-xs">
            <span className="material-icons text-xs">info</span> Export Options
          </h4>
          <ul className="text-[11px] text-blue-700 space-y-0.5">
            <li>• <strong>Excel & CSV:</strong> Complete datasets + Site Notes + GPS Coordinates.</li>
            <li>• <strong>PDF:</strong> Professional report with location satellite imagery + Executive Summary.</li>
            <li>• <strong>JSON & RAG:</strong> Structured data for facility management integration.</li>
          </ul>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-6">
          <button 
            type="button"
            onClick={exportToExcel} 
            className="bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl shadow-md flex flex-col items-center gap-1 transition"
          >
            <span className="material-icons text-xl">description</span>
            <span className="font-bold text-xs">Excel</span>
          </button>
          <button 
            type="button"
            onClick={exportToCSV} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl shadow-md flex flex-col items-center gap-1 transition"
          >
            <span className="material-icons text-xl">table_rows</span>
            <span className="font-bold text-xs">CSV</span>
          </button>
          <button 
            type="button"
            onClick={exportToPDF} 
            className="bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl shadow-md flex flex-col items-center gap-1 transition"
          >
            <span className="material-icons text-xl">picture_as_pdf</span>
            <span className="font-bold text-xs">PDF</span>
          </button>
          <button 
            type="button"
            onClick={exportToJSON} 
            className="bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl shadow-md flex flex-col items-center gap-1 transition"
          >
            <span className="material-icons text-xl">javascript</span>
            <span className="font-bold text-xs">JSON</span>
          </button>
          <button 
            type="button"
            onClick={exportForRAG} 
            className="bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl shadow-md flex flex-col items-center gap-1 transition"
          >
            <span className="material-icons text-xl">hub</span>
            <span className="font-bold text-xs">RAG</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button 
            type="button"
            onClick={() => setAppState((prev: any) => ({ ...prev, view: 'health-dashboard' }))} 
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs font-bold"
          >
            <span className="material-icons text-base">monitor_heart</span>
            <span>View Building Asset Health Heat Map</span>
          </button>

          <button 
            type="button"
            onClick={() => setAppState((prev: any) => ({ ...prev, view: 'assessment', currentRoomIndex: 0 }))} 
            className="text-indigo-600 font-bold hover:underline text-xs flex items-center justify-center gap-1 mt-1"
          >
            <span className="material-icons text-sm">edit</span>
            <span>Return to Area Assessment</span>
          </button>
          
          <button 
            type="button"
            onClick={() => setAppState((prev: any) => ({ ...prev, view: 'welcome' }))} 
            className="text-slate-600 font-bold hover:underline text-xs flex items-center justify-center gap-1"
          >
            <span className="material-icons text-sm">settings_applications</span>
            <span>Back to Site Setup</span>
          </button>

          <button 
            type="button"
            onClick={handleReset} 
            className="mt-2 border border-red-200 text-red-500 hover:bg-red-50 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5"
          >
            <span className="material-icons text-sm">delete_forever</span>
            <span>Start New Assessment (Clear Data)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
