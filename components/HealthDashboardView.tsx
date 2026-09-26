import React, { useState, useMemo } from 'react';
import { Room, Asset, SiteInfo } from '../types';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Cell
} from 'recharts';

interface HealthDashboardViewProps {
  siteInfo: SiteInfo;
  rooms: Room[];
  onSelectRoom: (roomIndex: number) => void;
  onPopulateSampleData?: () => void;
  hasEditLock?: boolean;
}

const CONDITIONS = ['Poor', 'Fair', 'Average', 'Good', 'Excellent'] as const;
type ConditionType = typeof CONDITIONS[number];

const CONDITION_COLORS: Record<ConditionType, { bg: string; text: string; hex: string; lightHex: string }> = {
  Poor: { bg: 'bg-red-500/20 text-red-400 border-red-500/40', text: 'text-red-400', hex: '#EF4444', lightHex: '#FEE2E2' },
  Fair: { bg: 'bg-orange-500/20 text-orange-400 border-orange-500/40', text: 'text-orange-400', hex: '#F97316', lightHex: '#FFEDD5' },
  Average: { bg: 'bg-amber-500/20 text-amber-400 border-amber-500/40', text: 'text-amber-400', hex: '#EAB308', lightHex: '#FEF9C3' },
  Good: { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', text: 'text-emerald-400', hex: '#10B981', lightHex: '#D1FAE5' },
  Excellent: { bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40', text: 'text-cyan-400', hex: '#06B6D4', lightHex: '#CFFAFE' },
};

const SYSTEM_CATEGORIES = [
  'Building Fabric',
  'Electrical',
  'HVAC & Mech',
  'Plumbing',
  'Fire & Safety',
  'Security & Grounds',
] as const;

export const HealthDashboardView: React.FC<HealthDashboardViewProps> = ({
  siteInfo,
  rooms,
  onSelectRoom,
  onPopulateSampleData,
  hasEditLock = true,
}) => {
  const [activeTab, setActiveTab] = useState<'conditionHeatmap' | 'systemHeatmap' | 'spectrum' | 'rankings'>('conditionHeatmap');
  const [filterMode, setFilterMode] = useState<'all' | 'problematic' | 'highRisk'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'problem' | 'health' | 'name' | 'assets'>('problem');

  // Compute room statistics
  const roomStats = useMemo(() => {
    return rooms.map((room, index) => {
      const assets = room.assets || [];
      const totalAssets = assets.length;

      const conditionCounts: Record<ConditionType, number> = {
        Poor: 0,
        Fair: 0,
        Average: 0,
        Good: 0,
        Excellent: 0,
      };

      const conditionAssets: Record<ConditionType, Asset[]> = {
        Poor: [],
        Fair: [],
        Average: [],
        Good: [],
        Excellent: [],
      };

      let extremeRiskCount = 0;
      let highRiskCount = 0;
      let totalCostNum = 0;
      let defectCostNum = 0;

      assets.forEach((a) => {
        const cond = (a.condition || 'Average') as ConditionType;
        if (conditionCounts[cond] !== undefined) {
          conditionCounts[cond] += 1;
          conditionAssets[cond].push(a);
        } else {
          conditionCounts['Average'] += 1;
          conditionAssets['Average'].push(a);
        }

        if (a.riskRating === 'Extreme') extremeRiskCount++;
        if (a.riskRating === 'High') highRiskCount++;

        const parsedCost = parseFloat(String(a.cost || '0').replace(/[^0-9.-]+/g, '')) || 0;
        totalCostNum += parsedCost;
        if (cond === 'Poor' || cond === 'Fair') {
          defectCostNum += parsedCost;
        }
      });

      const defectCount = conditionCounts.Poor + conditionCounts.Fair;

      // Health Score Calculation (0 - 100)
      let healthScore = 100;
      if (totalAssets > 0) {
        const weightedScore =
          conditionCounts.Poor * 10 +
          conditionCounts.Fair * 35 +
          conditionCounts.Average * 65 +
          conditionCounts.Good * 85 +
          conditionCounts.Excellent * 100;
        healthScore = Math.round(weightedScore / totalAssets);
      }

      // Problem Score: Higher means more urgent
      const problemScore =
        conditionCounts.Poor * 35 +
        conditionCounts.Fair * 18 +
        extremeRiskCount * 25 +
        highRiskCount * 12;

      // System breakdown
      const systemScores: Record<string, { count: number; worstCondition: ConditionType; score: number }> = {};
      SYSTEM_CATEGORIES.forEach((sys) => {
        systemScores[sys] = { count: 0, worstCondition: 'Excellent', score: 100 };
      });

      assets.forEach((a) => {
        const cat = (a.category || '').toLowerCase();
        let matchedSys: typeof SYSTEM_CATEGORIES[number] = 'Building Fabric';
        if (cat.includes('electrical') || cat.includes('lighting') || cat.includes('switchboard') || cat.includes('power')) {
          matchedSys = 'Electrical';
        } else if (cat.includes('hvac') || cat.includes('ac') || cat.includes('ventilation') || cat.includes('chiller') || cat.includes('fan')) {
          matchedSys = 'HVAC & Mech';
        } else if (cat.includes('plumb') || cat.includes('water') || cat.includes('drain') || cat.includes('sink') || cat.includes('toilet')) {
          matchedSys = 'Plumbing';
        } else if (cat.includes('fire') || cat.includes('alarm') || cat.includes('extinguisher') || cat.includes('smoke')) {
          matchedSys = 'Fire & Safety';
        } else if (cat.includes('security') || cat.includes('cctv') || cat.includes('ground') || cat.includes('gate') || cat.includes('fence')) {
          matchedSys = 'Security & Grounds';
        }

        systemScores[matchedSys].count += 1;
        const cond = (a.condition || 'Average') as ConditionType;
        const condWeight: Record<ConditionType, number> = { Poor: 1, Fair: 2, Average: 3, Good: 4, Excellent: 5 };
        const currentWorst = systemScores[matchedSys].worstCondition;
        if (condWeight[cond] < condWeight[currentWorst]) {
          systemScores[matchedSys].worstCondition = cond;
        }
      });

      // Status tier
      let statusTier: 'CRITICAL' | 'DEGRADED' | 'ATTENTION' | 'OPTIMAL' = 'OPTIMAL';
      if (conditionCounts.Poor > 0 || extremeRiskCount > 0 || healthScore < 55) {
        statusTier = 'CRITICAL';
      } else if (conditionCounts.Fair > 0 || highRiskCount > 0 || healthScore < 75) {
        statusTier = 'DEGRADED';
      } else if (conditionCounts.Average > 0 || healthScore < 85) {
        statusTier = 'ATTENTION';
      }

      return {
        room,
        originalIndex: index,
        roomName: room.roomName || `Room ${index + 1}`,
        buildingName: room.buildingName || siteInfo.name || 'Building',
        totalAssets,
        conditionCounts,
        conditionAssets,
        defectCount,
        extremeRiskCount,
        highRiskCount,
        totalCostNum,
        defectCostNum,
        healthScore,
        problemScore,
        systemScores,
        statusTier,
      };
    });
  }, [rooms, siteInfo.name]);

  // Filtered & Sorted room stats
  const filteredRooms = useMemo(() => {
    return roomStats
      .filter((r) => {
        const matchesQuery =
          r.roomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.buildingName.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesQuery) return false;

        if (filterMode === 'problematic') {
          return r.defectCount > 0 || r.healthScore < 75;
        }
        if (filterMode === 'highRisk') {
          return r.extremeRiskCount > 0 || r.highRiskCount > 0;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'problem') return b.problemScore - a.problemScore;
        if (sortBy === 'health') return a.healthScore - b.healthScore;
        if (sortBy === 'name') return a.roomName.localeCompare(b.roomName);
        if (sortBy === 'assets') return b.totalAssets - a.totalAssets;
        return 0;
      });
  }, [roomStats, searchQuery, filterMode, sortBy]);

  // Overall building KPIs
  const buildingKPIs = useMemo(() => {
    const totalRooms = roomStats.length;
    const totalAssets = roomStats.reduce((acc, r) => acc + r.totalAssets, 0);
    const problematicRooms = roomStats.filter((r) => r.defectCount > 0).length;
    const criticalRooms = roomStats.filter((r) => r.statusTier === 'CRITICAL').length;
    const totalDefects = roomStats.reduce((acc, r) => acc + r.defectCount, 0);
    const totalPoor = roomStats.reduce((acc, r) => acc + r.conditionCounts.Poor, 0);
    const totalFair = roomStats.reduce((acc, r) => acc + r.conditionCounts.Fair, 0);
    const totalAverage = roomStats.reduce((acc, r) => acc + r.conditionCounts.Average, 0);
    const totalGood = roomStats.reduce((acc, r) => acc + r.conditionCounts.Good, 0);
    const totalExcellent = roomStats.reduce((acc, r) => acc + r.conditionCounts.Excellent, 0);
    const totalRemediationCost = roomStats.reduce((acc, r) => acc + r.defectCostNum, 0);

    let buildingHealthScore = 100;
    if (totalAssets > 0) {
      const weightedScore =
        totalPoor * 10 +
        totalFair * 35 +
        totalAverage * 65 +
        totalGood * 85 +
        totalExcellent * 100;
      buildingHealthScore = Math.round(weightedScore / totalAssets);
    }

    return {
      totalRooms,
      totalAssets,
      problematicRooms,
      criticalRooms,
      totalDefects,
      totalPoor,
      totalFair,
      totalAverage,
      totalGood,
      totalExcellent,
      totalRemediationCost,
      buildingHealthScore,
    };
  }, [roomStats]);

  // Recharts Scatter Heat Map Dataset (Rooms × Conditions)
  const conditionScatterData = useMemo(() => {
    const data: Array<{
      roomName: string;
      condition: ConditionType;
      count: number;
      roomIndex: number;
      roomId: string;
      healthScore: number;
      assets: Asset[];
      statusTier: string;
      cellBg: string;
      cellStroke: string;
      textColor: string;
      sizeWeight: number;
    }> = [];

    filteredRooms.forEach((r) => {
      CONDITIONS.forEach((cond) => {
        const count = r.conditionCounts[cond];
        let cellBg = '#1E293B'; // neutral slate
        let cellStroke = '#334155';
        let textColor = '#64748B';

        if (count > 0) {
          if (cond === 'Poor') {
            cellBg = count >= 3 ? '#DC2626' : count >= 1 ? '#EF4444' : '#F87171';
            cellStroke = '#B91C1C';
            textColor = '#FFFFFF';
          } else if (cond === 'Fair') {
            cellBg = count >= 3 ? '#EA580C' : '#F97316';
            cellStroke = '#C2410C';
            textColor = '#FFFFFF';
          } else if (cond === 'Average') {
            cellBg = count >= 3 ? '#D97706' : '#F59E0B';
            cellStroke = '#B45309';
            textColor = '#1E293B';
          } else if (cond === 'Good') {
            cellBg = count >= 3 ? '#059669' : '#10B981';
            cellStroke = '#047857';
            textColor = '#FFFFFF';
          } else if (cond === 'Excellent') {
            cellBg = count >= 3 ? '#0891B2' : '#06B6D4';
            cellStroke = '#0e7490';
            textColor = '#FFFFFF';
          }
        }

        data.push({
          roomName: r.roomName,
          condition: cond,
          count,
          roomIndex: r.originalIndex,
          roomId: r.room.id,
          healthScore: r.healthScore,
          assets: r.conditionAssets[cond],
          statusTier: r.statusTier,
          cellBg,
          cellStroke,
          textColor,
          sizeWeight: count === 0 ? 1 : Math.min(count * 20, 100),
        });
      });
    });

    return data;
  }, [filteredRooms]);

  // Recharts Systems Heat Map Dataset (Rooms × System Categories)
  const systemScatterData = useMemo(() => {
    const data: Array<{
      roomName: string;
      system: string;
      count: number;
      worstCondition: ConditionType;
      roomIndex: number;
      cellBg: string;
      textColor: string;
    }> = [];

    filteredRooms.forEach((r) => {
      SYSTEM_CATEGORIES.forEach((sys) => {
        const sysInfo = r.systemScores[sys];
        let cellBg = '#1E293B';
        let textColor = '#475569';

        if (sysInfo.count > 0) {
          const colorMap = CONDITION_COLORS[sysInfo.worstCondition];
          cellBg = colorMap.hex;
          textColor = sysInfo.worstCondition === 'Average' ? '#1E293B' : '#FFFFFF';
        }

        data.push({
          roomName: r.roomName,
          system: sys,
          count: sysInfo.count,
          worstCondition: sysInfo.worstCondition,
          roomIndex: r.originalIndex,
          cellBg,
          textColor,
        });
      });
    });

    return data;
  }, [filteredRooms]);

  // Stacked Bar Chart Dataset for Condition Spectrum
  const spectrumBarData = useMemo(() => {
    return filteredRooms.map((r) => ({
      name: r.roomName,
      roomIndex: r.originalIndex,
      Poor: r.conditionCounts.Poor,
      Fair: r.conditionCounts.Fair,
      Average: r.conditionCounts.Average,
      Good: r.conditionCounts.Good,
      Excellent: r.conditionCounts.Excellent,
      healthScore: r.healthScore,
      totalAssets: r.totalAssets,
    }));
  }, [filteredRooms]);

  // Selected Room for in-depth drawer
  const activeSelectedRoom = useMemo(() => {
    if (!selectedRoomId) return null;
    return roomStats.find((r) => r.room.id === selectedRoomId) || null;
  }, [roomStats, selectedRoomId]);

  // Custom Scatter Cell Shape for Recharts
  const renderConditionHeatCell = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || !payload) return null;

    const width = 84;
    const height = 34;
    const isZero = payload.count === 0;

    return (
      <g
        className="cursor-pointer transition-transform hover:scale-105"
        onClick={() => {
          setSelectedRoomId(payload.roomId);
        }}
      >
        <rect
          x={cx - width / 2}
          y={cy - height / 2}
          width={width}
          height={height}
          rx={6}
          fill={payload.cellBg}
          stroke={payload.cellStroke}
          strokeWidth={1.5}
          opacity={isZero ? 0.35 : 0.95}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={payload.textColor}
          fontSize={11}
          fontWeight="bold"
        >
          {isZero ? '-' : payload.count}
        </text>
      </g>
    );
  };

  const renderSystemHeatCell = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || !payload) return null;

    const width = 88;
    const height = 34;
    const isZero = payload.count === 0;

    return (
      <g
        className="cursor-pointer transition-transform hover:scale-105"
        onClick={() => {
          onSelectRoom(payload.roomIndex);
        }}
      >
        <rect
          x={cx - width / 2}
          y={cy - height / 2}
          width={width}
          height={height}
          rx={6}
          fill={payload.cellBg}
          stroke="#334155"
          strokeWidth={1}
          opacity={isZero ? 0.25 : 0.95}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={payload.textColor}
          fontSize={10}
          fontWeight="bold"
        >
          {isZero ? '-' : `${payload.count} (${payload.worstCondition[0]})`}
        </text>
      </g>
    );
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 animate-fade-in text-slate-100">
      
      {/* TOP HEADER & TITLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Building Condition Intelligence
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {siteInfo.name || 'Commercial Facility'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                <span className="material-icons text-2xl">monitor_heart</span>
              </span>
              <span>Asset Health Heat Map Dashboard</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
              Real-time multi-dimensional heat map indexing asset wear, physical condition distribution,
              and critical degradation hotspots across all building zones.
            </p>
          </div>

          {/* Quick Actions & Demo Populator */}
          <div className="flex flex-wrap items-center gap-3">
            {buildingKPIs.totalAssets === 0 && onPopulateSampleData && (
              <button
                onClick={onPopulateSampleData}
                className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg flex items-center gap-2 border border-indigo-400/30"
              >
                <span className="material-icons text-sm">auto_fix_high</span>
                <span>Load Sample Building Heatmap</span>
              </button>
            )}
            <button
              onClick={() => onSelectRoom(0)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center gap-2"
            >
              <span className="material-icons text-sm">assignment</span>
              <span>Jump to Inspections</span>
            </button>
          </div>
        </div>

        {/* OVERALL BUILDING KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mt-8 pt-6 border-t border-slate-800/80">
          {/* Building Health Index */}
          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Health Index</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-2xl font-black ${
                buildingKPIs.buildingHealthScore >= 80 ? 'text-emerald-400' :
                buildingKPIs.buildingHealthScore >= 65 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {buildingKPIs.buildingHealthScore}%
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {buildingKPIs.buildingHealthScore >= 80 ? 'Optimal' : buildingKPIs.buildingHealthScore >= 65 ? 'Fair' : 'Degraded'}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  buildingKPIs.buildingHealthScore >= 80 ? 'bg-emerald-500' :
                  buildingKPIs.buildingHealthScore >= 65 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${buildingKPIs.buildingHealthScore}%` }}
              ></div>
            </div>
          </div>

          {/* Problematic Rooms */}
          <div className="bg-slate-950/60 border border-red-500/20 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] text-red-400 uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Problem Rooms</span>
              <span className="material-icons text-xs text-red-400">warning</span>
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-red-400">
                {buildingKPIs.problematicRooms}
              </span>
              <span className="text-[10px] text-slate-400">
                of {buildingKPIs.totalRooms} rooms
              </span>
            </div>
            <div className="text-[10px] text-red-300/80 mt-2 font-medium">
              {buildingKPIs.criticalRooms} critical action
            </div>
          </div>

          {/* Defect Assets */}
          <div className="bg-slate-950/60 border border-orange-500/20 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] text-orange-400 uppercase font-bold tracking-wider">Defect Assets</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-orange-400">
                {buildingKPIs.totalDefects}
              </span>
              <span className="text-[10px] text-slate-400">
                Poor / Fair
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              {buildingKPIs.totalPoor} Poor, {buildingKPIs.totalFair} Fair
            </div>
          </div>

          {/* Total Assets Inspected */}
          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Assets</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-white">
                {buildingKPIs.totalAssets}
              </span>
              <span className="text-[10px] text-slate-400">logged</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-2">
              {buildingKPIs.totalGood + buildingKPIs.totalExcellent} Good/Exc.
            </div>
          </div>

          {/* Estimated Defect Exposure */}
          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Remediation CAPEX</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xl font-black text-amber-400 truncate">
                ${buildingKPIs.totalRemediationCost.toLocaleString()}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              Cost of Poor/Fair assets
            </div>
          </div>

          {/* Condition Distribution Pills */}
          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Distribution</span>
            <div className="grid grid-cols-5 gap-1 mt-2 text-center">
              <div>
                <div className="text-[9px] font-bold text-red-400">P</div>
                <div className="text-xs font-black text-white">{buildingKPIs.totalPoor}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-orange-400">F</div>
                <div className="text-xs font-black text-white">{buildingKPIs.totalFair}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-amber-400">A</div>
                <div className="text-xs font-black text-white">{buildingKPIs.totalAverage}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-emerald-400">G</div>
                <div className="text-xs font-black text-white">{buildingKPIs.totalGood}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-cyan-400">E</div>
                <div className="text-xs font-black text-white">{buildingKPIs.totalExcellent}</div>
              </div>
            </div>
            <div className="text-[9px] text-slate-500 mt-2 text-center">
              P=Poor, F=Fair, A=Avg, G=Good, E=Exc
            </div>
          </div>
        </div>
      </div>

      {/* CONTROLS & HEAT MAP TABS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Heat Map Display Mode Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('conditionHeatmap')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'conditionHeatmap'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="material-icons text-sm">grid_view</span>
            <span>Condition Matrix Heatmap</span>
          </button>
          <button
            onClick={() => setActiveTab('systemHeatmap')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'systemHeatmap'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="material-icons text-sm">hub</span>
            <span>Systems Heat Grid</span>
          </button>
          <button
            onClick={() => setActiveTab('spectrum')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'spectrum'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="material-icons text-sm">stacked_bar_chart</span>
            <span>Stacked Spectrum</span>
          </button>
          <button
            onClick={() => setActiveTab('rankings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'rankings'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="material-icons text-sm">leaderboard</span>
            <span>Room Problem Ranking</span>
          </button>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
            <input
              type="text"
              placeholder="Search room name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 sm:w-52"
            />
          </div>

          {/* Filter Status Selector */}
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Rooms ({roomStats.length})</option>
            <option value="problematic">Problematic Only ({buildingKPIs.problematicRooms})</option>
            <option value="highRisk">High/Extreme Risk</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="problem">Sort: Most Problematic</option>
            <option value="health">Sort: Lowest Health</option>
            <option value="name">Sort: Room Name</option>
            <option value="assets">Sort: Asset Count</option>
          </select>
        </div>
      </div>

      {/* EMPTY STATE ALERT */}
      {buildingKPIs.totalAssets === 0 && (
        <div className="bg-slate-900 border-2 border-dashed border-slate-800 rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <span className="material-icons text-3xl">grid_off</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Asset Inspection Data Found Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Start adding assets in the Asset Assessment view or click below to populate realistic sample data to see the heat map in action.
            </p>
          </div>
          {onPopulateSampleData && (
            <button
              onClick={onPopulateSampleData}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition shadow-md flex items-center gap-2"
            >
              <span className="material-icons text-sm">auto_fix_high</span>
              <span>Generate Sample Multi-Room Inspection Data</span>
            </button>
          )}
        </div>
      )}

      {/* MAIN VISUALIZATION SECTION */}
      {buildingKPIs.totalAssets > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: RECHARTS HEAT MAP CONTAINER */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="material-icons text-indigo-400 text-base">
                    {activeTab === 'conditionHeatmap' ? 'heat_pump' :
                     activeTab === 'systemHeatmap' ? 'hub' :
                     activeTab === 'spectrum' ? 'stacked_bar_chart' : 'leaderboard'}
                  </span>
                  <span>
                    {activeTab === 'conditionHeatmap' && 'Building Room Condition Heat Matrix (Recharts)'}
                    {activeTab === 'systemHeatmap' && 'Systems Degradation Heat Grid (Recharts)'}
                    {activeTab === 'spectrum' && 'Room Asset Condition Spectrum Breakdown'}
                    {activeTab === 'rankings' && 'Problematic Room Health Scores & Defect Severity'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {activeTab === 'conditionHeatmap' && 'Each tile indicates asset count per condition grade. Click any tile or room to inspect.'}
                  {activeTab === 'systemHeatmap' && 'Color represents the worst condition found within that specific facility system in the room.'}
                  {activeTab === 'spectrum' && 'Normalized distribution of asset condition tiers across each building zone.'}
                  {activeTab === 'rankings' && 'Rooms ranked by problem severity and weighted condition health scores.'}
                </p>
              </div>

              {/* Legend Badges */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                {CONDITIONS.map((cond) => (
                  <span
                    key={cond}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold"
                    style={{ backgroundColor: `${CONDITION_COLORS[cond].hex}25`, color: CONDITION_COLORS[cond].hex, border: `1px solid ${CONDITION_COLORS[cond].hex}40` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONDITION_COLORS[cond].hex }}></span>
                    {cond}
                  </span>
                ))}
              </div>
            </div>

            {/* TAB 1: 2D CONDITION HEATMAP VIA RECHARTS SCATTERCHART */}
            {activeTab === 'conditionHeatmap' && (
              <div className="w-full overflow-x-auto">
                <div style={{ minWidth: '580px', height: Math.max(380, filteredRooms.length * 54 + 90) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      margin={{ top: 25, right: 30, bottom: 25, left: 130 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis
                        type="category"
                        dataKey="condition"
                        name="Condition"
                        stroke="#94A3B8"
                        tick={{ fill: '#CBD5E1', fontSize: 11, fontWeight: 'bold' }}
                        interval={0}
                      />
                      <YAxis
                        type="category"
                        dataKey="roomName"
                        name="Room"
                        stroke="#94A3B8"
                        tick={{ fill: '#E2E8F0', fontSize: 11 }}
                        interval={0}
                      />
                      <ZAxis type="number" dataKey="sizeWeight" range={[150, 400]} />
                      <RechartsTooltip
                        cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-950 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs max-w-xs text-left">
                                <div className="font-bold text-white flex items-center justify-between gap-2">
                                  <span>{data.roomName}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                    data.statusTier === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                                    data.statusTier === 'DEGRADED' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' :
                                    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  }`}>
                                    {data.statusTier}
                                  </span>
                                </div>
                                <div className="mt-2 text-slate-300">
                                  Condition: <strong style={{ color: CONDITION_COLORS[data.condition as ConditionType]?.hex }}>{data.condition}</strong>
                                </div>
                                <div className="text-slate-300">
                                  Assets in grade: <strong className="text-white">{data.count}</strong>
                                </div>
                                {data.assets && data.assets.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-slate-800">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Assets:</div>
                                    <ul className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                      {data.assets.map((a: Asset) => (
                                        <li key={a.id} className="text-[11px] text-slate-300 truncate flex items-center justify-between gap-1">
                                          <span>• {a.name || a.category}</span>
                                          {a.riskRating && (
                                            <span className="text-[9px] font-mono text-slate-400">[{a.riskRating}]</span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center text-[10px] text-indigo-400 font-bold">
                                  <span>Click to inspect room</span>
                                  <span className="material-icons text-xs">arrow_forward</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter
                        name="Condition Cells"
                        data={conditionScatterData}
                        shape={renderConditionHeatCell}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* TAB 2: 2D SYSTEMS HEAT GRID VIA RECHARTS SCATTERCHART */}
            {activeTab === 'systemHeatmap' && (
              <div className="w-full overflow-x-auto">
                <div style={{ minWidth: '650px', height: Math.max(380, filteredRooms.length * 54 + 90) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      margin={{ top: 25, right: 30, bottom: 25, left: 130 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis
                        type="category"
                        dataKey="system"
                        name="System"
                        stroke="#94A3B8"
                        tick={{ fill: '#CBD5E1', fontSize: 10, fontWeight: 'bold' }}
                        interval={0}
                      />
                      <YAxis
                        type="category"
                        dataKey="roomName"
                        name="Room"
                        stroke="#94A3B8"
                        tick={{ fill: '#E2E8F0', fontSize: 11 }}
                        interval={0}
                      />
                      <ZAxis type="number" range={[200, 300]} />
                      <RechartsTooltip
                        cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-950 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs text-left">
                                <div className="font-bold text-white">{data.roomName}</div>
                                <div className="text-slate-300 mt-1">System: <strong>{data.system}</strong></div>
                                <div className="text-slate-300">Logged Assets: <strong>{data.count}</strong></div>
                                <div className="text-slate-300">
                                  Worst Condition: <strong style={{ color: CONDITION_COLORS[data.worstCondition as ConditionType]?.hex }}>{data.worstCondition}</strong>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter
                        name="System Cells"
                        data={systemScatterData}
                        shape={renderSystemHeatCell}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* TAB 3: STACKED CONDITION SPECTRUM (BARCHART) */}
            {activeTab === 'spectrum' && (
              <div className="w-full">
                <div style={{ height: Math.max(360, filteredRooms.length * 44 + 60) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={spectrumBarData}
                      margin={{ top: 15, right: 30, bottom: 15, left: 110 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1E293B" />
                      <XAxis type="number" stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" stroke="#94A3B8" tick={{ fill: '#E2E8F0', fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '12px', fontSize: '11px' }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => <span className="text-xs text-slate-300 font-bold">{value}</span>}
                      />
                      <Bar dataKey="Poor" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Fair" stackId="a" fill="#F97316" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Average" stackId="a" fill="#EAB308" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Good" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Excellent" stackId="a" fill="#06B6D4" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* TAB 4: ROOM PROBLEM RANKINGS & HEALTH SCORES */}
            {activeTab === 'rankings' && (
              <div className="w-full">
                <div style={{ height: Math.max(360, filteredRooms.length * 44 + 60) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={filteredRooms.map((r) => ({
                        name: r.roomName,
                        healthScore: r.healthScore,
                        defects: r.defectCount,
                        roomIndex: r.originalIndex,
                      }))}
                      margin={{ top: 15, right: 30, bottom: 15, left: 110 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1E293B" />
                      <XAxis type="number" domain={[0, 100]} stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" stroke="#94A3B8" tick={{ fill: '#E2E8F0', fontSize: 11 }} />
                      <ReferenceLine x={70} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Critical Threshold (70%)', fill: '#EF4444', fontSize: 10 }} />
                      <RechartsTooltip
                        formatter={(value) => [`${value}%`, 'Health Score']}
                        contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '12px', fontSize: '11px' }}
                      />
                      <Bar dataKey="healthScore" radius={[0, 6, 6, 0]}>
                        {filteredRooms.map((entry, index) => {
                          const score = entry.healthScore;
                          const color = score >= 80 ? '#10B981' : score >= 65 ? '#F97316' : '#EF4444';
                          return <Cell key={`cell-${index}`} fill={color} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* HEAT MAP FOOTER GUIDE */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="material-icons text-indigo-400 text-xs">info</span>
                <span>Click on any room name or heat matrix tile to open the quick inspection drill-down.</span>
              </div>
              <div className="text-slate-500 font-mono">
                Showing {filteredRooms.length} of {rooms.length} zones
              </div>
            </div>
          </div>

          {/* RIGHT: PROBLEMATIC ROOMS LIST & INSPECTION DRILLDOWN */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            
            {/* Quick Identification of Problematic Rooms Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-icons text-red-400 text-base">emergency</span>
                  <span>Priority Remediation Watchlist</span>
                </h3>
                <span className="text-[10px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">
                  {buildingKPIs.problematicRooms} Problematic
                </span>
              </div>

              {/* Problematic Room Cards List */}
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredRooms.map((r) => {
                  const isSelected = selectedRoomId === r.room.id;
                  return (
                    <div
                      key={r.room.id}
                      onClick={() => setSelectedRoomId(r.room.id)}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer text-left ${
                        isSelected
                          ? 'bg-indigo-950/60 border-indigo-500/80 shadow-md ring-1 ring-indigo-500'
                          : r.statusTier === 'CRITICAL'
                          ? 'bg-red-950/20 border-red-500/30 hover:bg-red-950/30'
                          : r.statusTier === 'DEGRADED'
                          ? 'bg-orange-950/20 border-orange-500/30 hover:bg-orange-950/30'
                          : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-xs text-white flex items-center gap-1.5">
                            <span className="material-icons text-xs text-slate-400">meeting_room</span>
                            <span className="truncate max-w-[150px]">{r.roomName}</span>
                          </h4>
                          <span className="text-[10px] text-slate-400">{r.totalAssets} assets logged</span>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            r.statusTier === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
                            r.statusTier === 'DEGRADED' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' :
                            'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          }`}>
                            {r.statusTier}
                          </span>
                          <span className="text-[10px] font-mono text-slate-300">
                            Health: <strong className={r.healthScore < 70 ? 'text-red-400' : 'text-emerald-400'}>{r.healthScore}%</strong>
                          </span>
                        </div>
                      </div>

                      {/* Defect Indicators */}
                      <div className="grid grid-cols-4 gap-1.5 mt-2.5 pt-2 border-t border-slate-800/60 text-center">
                        <div className="bg-slate-900/80 p-1 rounded-lg border border-red-500/20">
                          <div className="text-[8px] text-red-400 font-bold">Poor</div>
                          <div className="text-xs font-black text-red-400">{r.conditionCounts.Poor}</div>
                        </div>
                        <div className="bg-slate-900/80 p-1 rounded-lg border border-orange-500/20">
                          <div className="text-[8px] text-orange-400 font-bold">Fair</div>
                          <div className="text-xs font-black text-orange-400">{r.conditionCounts.Fair}</div>
                        </div>
                        <div className="bg-slate-900/80 p-1 rounded-lg border border-amber-500/20">
                          <div className="text-[8px] text-amber-400 font-bold">Average</div>
                          <div className="text-xs font-black text-amber-400">{r.conditionCounts.Average}</div>
                        </div>
                        <div className="bg-slate-900/80 p-1 rounded-lg border border-emerald-500/20">
                          <div className="text-[8px] text-emerald-400 font-bold">Good/Exc</div>
                          <div className="text-xs font-black text-emerald-400">
                            {r.conditionCounts.Good + r.conditionCounts.Excellent}
                          </div>
                        </div>
                      </div>

                      {/* Quick Inspect Button */}
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">
                          {r.defectCostNum > 0 ? `Defect Cost: $${r.defectCostNum.toLocaleString()}` : 'No defects'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRoom(r.originalIndex);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-sm"
                        >
                          <span>Inspect</span>
                          <span className="material-icons text-xs">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Room Drilldown Card */}
            {activeSelectedRoom && (
              <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl p-5 shadow-2xl animate-fade-in text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold tracking-wider">
                    Zone Inspection Detail
                  </span>
                  <button
                    onClick={() => setSelectedRoomId(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <span className="material-icons text-sm">close</span>
                  </button>
                </div>

                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span className="material-icons text-sm text-indigo-400">domain</span>
                  <span>{activeSelectedRoom.roomName}</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {activeSelectedRoom.buildingName} • {activeSelectedRoom.totalAssets} total assets
                </p>

                {/* Degraded assets quick checklist */}
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Degraded Assets Requiring Action:</span>
                    <span className="text-red-400 font-mono">{activeSelectedRoom.defectCount} items</span>
                  </div>

                  {activeSelectedRoom.defectCount === 0 ? (
                    <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-center text-xs text-emerald-400 flex items-center justify-center gap-1.5">
                      <span className="material-icons text-sm">check_circle</span>
                      <span>No critical or fair defects logged in this zone!</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {[
                        ...activeSelectedRoom.conditionAssets.Poor,
                        ...activeSelectedRoom.conditionAssets.Fair,
                      ].map((a) => (
                        <div
                          key={a.id}
                          className="p-2 bg-slate-950/80 border border-slate-800 rounded-xl flex items-start justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-200 line-clamp-1">{a.name}</div>
                            <div className="text-[10px] text-slate-400 line-clamp-1">{a.category}</div>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                            a.condition === 'Poor'
                              ? 'bg-red-500/20 text-red-400 border-red-500/40'
                              : 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                          }`}>
                            {a.condition}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Primary Button to Jump to Room */}
                <button
                  type="button"
                  onClick={() => onSelectRoom(activeSelectedRoom.originalIndex)}
                  className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2"
                >
                  <span className="material-icons text-sm">camera_alt</span>
                  <span>Inspect & Remediate {activeSelectedRoom.roomName}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
