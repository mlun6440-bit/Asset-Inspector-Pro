import React from 'react';
import { SiteInfo, Room } from '../types';
import { RISK_OPTIONS, RISK_COLORS } from '../constants';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';

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
  return (
    <div className="flex-1 p-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full animate-fade-in-up">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Assessment Complete!</h2>
          <p className="text-sm text-gray-500">Your data has been saved locally. Review the Site Notes and Export.</p>
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
                  {RISK_OPTIONS.map((risk: string) => { 
                    const count = (currentAssessmentRiskDistribution.counts as Record<string, number>)[risk] || 0;
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
                  <p className="text-[11px] leading-relaxed text-gray-500 font-medium text-left">
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
            value={siteInfo.notes || ''}
            onChange={(e) => handleSiteInfoChange('notes', e.target.value)}
            onBlur={saveGlobalState}
          />
          <p className="text-xs text-gray-500 mt-1 italic text-left">
            * This section is automatically populated with a summary of your conversation with the AI Engineering Manager.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8 text-left">
          <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2 text-sm">
            <span className="material-icons text-sm">info</span> Export Options
          </h4>
          <ul className="text-xs text-blue-700 space-y-1">
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
          <button 
            onClick={() => setAppState((prev: any) => ({ ...prev, view: 'assessment', currentRoomIndex: 0 }))} 
            className="text-indigo-600 font-bold hover:underline text-sm flex items-center justify-center gap-1"
            title="Go back to Area Assessment to verify and edit room assets"
          >
            <span className="material-icons text-sm">edit</span> Return to Area Assessment
          </button>
          
          <button 
            onClick={() => setAppState((prev: any) => ({ ...prev, view: 'welcome' }))} 
            className="text-slate-600 font-bold hover:underline text-sm flex items-center justify-center gap-1 mt-1"
            title="Go back to Site Details Setup (Welcome screen) to make general site adjustments"
          >
            <span className="material-icons text-sm">settings_applications</span> Back to Site Setup
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
  );
};
