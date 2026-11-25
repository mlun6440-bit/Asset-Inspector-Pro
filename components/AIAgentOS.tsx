import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Brain, Cpu, Sliders, Play, Plus, Trash2, Search, Sparkles, 
  Terminal, CheckCircle, AlertTriangle, ShieldAlert, TrendingUp, 
  BookOpen, HelpCircle, FileText, Check, Database, RefreshCw,
  Upload, FileSpreadsheet, CheckSquare, Square, Wrench, ArrowRight,
  TrendingDown, Coins, Percent, Landmark, BarChart2, FileSignature,
  Camera, Calendar, Layers, Network
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  AppState, Room, Asset, AgentOSState, AgentMemoryItem, AgentSkill, WorkOrder,
  CogneeNode, CogneeEdge, CogneeGraphState 
} from '../types';
import { 
  analyzePMReportAndMapConditions, ProposedConditionUpdate, analyzeCFOFinance, CFOAnalysisResult,
  analyzeAsBuiltDrawing, analyzeHistoricalVisionDegradation, analyzeWorkOrdersForCapexOrRework, WorkOrderAnalysisResult,
  cognifyDataSources, queryCogneeGraph
} from '../services/geminiService';
import { AsBuiltDrawing, HistoricalVisionCapture } from '../types';
import { compileFacilityKnowledgeGraph, analyzeGraphRiskPropagation, queryKnowledgeGraph, GraphCascadeRiskResult } from '../services/graphCompiler';
import { useNotify } from './NotificationProvider';

const computeGraphLayout = (nodes: any[], edges: any[]) => {
  const width = 640;
  const height = 480;
  
  const positionedNodes = nodes.map((node, idx) => {
    let layer = 0;
    if (node.type === 'Site') layer = 1;
    else if (node.type === 'Room' || node.type === 'System') layer = 2;
    else if (node.type === 'Asset' || node.type === 'WorkOrder') layer = 3;
    else layer = 4;

    return {
      ...node,
      layer,
      x: node.x || width / 2,
      y: node.y || height / 2,
    };
  });

  const siteNode = positionedNodes.find(n => n.type === 'Site');
  if (siteNode) {
    siteNode.x = width / 2;
    siteNode.y = height / 2;
  }

  const layer2Nodes = positionedNodes.filter(n => n.layer === 2);
  layer2Nodes.forEach((node, idx) => {
    const angle = (idx / (layer2Nodes.length || 1)) * 2 * Math.PI;
    node.x = width / 2 + Math.cos(angle) * 120;
    node.y = height / 2 + Math.sin(angle) * 120;
  });

  const layer3Nodes = positionedNodes.filter(n => n.layer >= 3);
  layer3Nodes.forEach((node, idx) => {
    const connectedRoomEdge = edges.find(e => e.target === node.id && e.source.startsWith('room-'));
    const parentRoomId = connectedRoomEdge ? connectedRoomEdge.source : null;
    const parentNode = parentRoomId ? positionedNodes.find(n => n.id === parentRoomId) : null;

    if (parentNode) {
      const angle = (idx / (layer3Nodes.length || 1)) * 2 * Math.PI;
      node.x = parentNode.x + Math.cos(angle) * 60 + (Math.random() - 0.5) * 10;
      node.y = parentNode.y + Math.sin(angle) * 60 + (Math.random() - 0.5) * 10;
    } else {
      const angle = (idx / (layer3Nodes.length || 1)) * 2 * Math.PI;
      node.x = width / 2 + Math.cos(angle) * 200;
      node.y = height / 2 + Math.sin(angle) * 200;
    }
  });

  for (let step = 0; step < 15; step++) {
    for (let i = 0; i < positionedNodes.length; i++) {
      for (let j = i + 1; j < positionedNodes.length; j++) {
        const n1 = positionedNodes[i];
        const n2 = positionedNodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = 45;
        if (dist < minDist) {
          const force = (minDist - dist) / dist * 0.15;
          const pushX = dx * force;
          const pushY = dy * force;
          if (n1.type !== 'Site') {
            n1.x -= pushX;
            n1.y -= pushY;
          }
          if (n2.type !== 'Site') {
            n2.x += pushX;
            n2.y += pushY;
          }
        }
      }
    }

    edges.forEach(edge => {
      const sourceNode = positionedNodes.find(n => n.id === edge.source);
      const targetNode = positionedNodes.find(n => n.id === edge.target);
      if (sourceNode && targetNode) {
        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const desiredDist = 70;
        const force = (dist - desiredDist) / dist * 0.05;
        const pullX = dx * force;
        const pullY = dy * force;
        if (sourceNode.type !== 'Site') {
          sourceNode.x += pullX;
          sourceNode.y += pullY;
        }
        if (targetNode.type !== 'Site') {
          targetNode.x -= pullX;
          targetNode.y -= pullY;
        }
      }
    });

    positionedNodes.forEach(node => {
      node.x = Math.max(30, Math.min(width - 30, node.x));
      node.y = Math.max(30, Math.min(height - 30, node.y));
    });
  }

  return positionedNodes;
};

interface AIAgentOSProps {
  siteInfo: any;
  rooms: Room[];
  onUpdateSiteInfo: (key: string, value: any) => void;
  onSave: () => void;
  hasEditLock: boolean;
  onNavigateToClause?: (clauseId: string) => void;
  onUpdateRooms?: (rooms: Room[]) => void;
}

export const AIAgentOS: React.FC<AIAgentOSProps> = ({
  siteInfo,
  rooms,
  onUpdateSiteInfo,
  onSave,
  hasEditLock,
  onNavigateToClause,
  onUpdateRooms
}) => {
  const { notify } = useNotify();
  // State for Agent OS
  const [osState, setOsState] = useState<AgentOSState>(() => {
    if (siteInfo.agentOS) {
      return {
        ...siteInfo.agentOS,
        workOrders: siteInfo.agentOS.workOrders || []
      };
    }
    // Default initial state
    return {
      enabled: true,
      skills: [
        { id: 'compliance', name: 'ISO 55001 Compliance Auditor', description: 'Audits physical assets against standard compliance guidelines, checking lifecycle processes and legal documentation.', category: 'compliance', enabled: true },
        { id: 'finance', name: 'AI CFO & Strategic Capital Monitor', description: 'Provides real-time financial tracking, replacement cash flow forecasting, asset condition/risk rankings, and executive-level summaries.', category: 'finance', enabled: true },
        { id: 'risk', name: 'Risk Vector Mitigator', description: 'Identifies immediate safety hazards and generates high-fidelity remediation and contingency plans.', category: 'risk', enabled: true },
        { id: 'vision', name: 'Multi-Modal Vision Extractor', description: 'Enables real-time visual assessment, deduplication, and OCR parsing of technical vendor asset registers.', category: 'vision', enabled: true },
        { id: 'video_walk', name: 'Gemini Continuous Video Walk Extractor', description: 'Agentic multimodal video surveyor (Brad Bonanno long-context technique): ingests continuous facility walkthroughs (phone, GoPro, YouTube), temporal-spatial grounding, automatic room transitions, and ISO 55000 asset logging.', category: 'vision', enabled: true }
      ],
      memories: [],
      customRules: [
        "Flag any structural concrete defects in wet rooms as High or Extreme Risk immediately.",
        "Ensure every major structural asset has a defined Remaining Useful Life (RUL) conforming to ISO 55001:2024 Clause 8.1."
      ],
      workOrders: []
    };
  });

  // Local state for UI
  const [searchTerm, setSearchTerm] = useState('');
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<'observation' | 'site_fact' | 'rule'>('site_fact');
  const [newRuleText, setNewRuleText] = useState('');
  
  // Terminal execution states
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any | null>(null);

  // PM Report Auto-Tuning State
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [isAnalyzingPM, setIsAnalyzingPM] = useState(false);
  const [proposedUpdates, setProposedUpdates] = useState<ProposedConditionUpdate[]>([]);
  const [selectedUpdates, setSelectedUpdates] = useState<Record<string, boolean>>({});
  const [tuningSuccessMsg, setTuningSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- NEW: Second Brain Tabs, As-Builts, and Vision Timeline states ---
  const [brainTab, setBrainTab] = useState<'memories' | 'asbuilt' | 'vision' | 'workorders' | 'cognee'>('memories');

  // Cognee AI Graph States
  const [unstructuredCogneeText, setUnstructuredCogneeText] = useState('');
  const [isCognifying, setIsCognifying] = useState(false);
  const [cognifyLogs, setCognifyLogs] = useState<string[]>([]);
  const [cogneeSearchQuery, setCogneeSearchQuery] = useState('');
  const [isQueryingGraph, setIsQueryingGraph] = useState(false);
  const [graphQueryResponse, setGraphQueryResponse] = useState<{
    answer: string;
    traversedNodes: string[];
    traversedEdges: string[];
  } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>('all');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  
  // As-Built Drawings Form States
  const [dwgDiscipline, setDwgDiscipline] = useState<'Architectural' | 'Electrical' | 'Mechanical' | 'Plumbing' | 'Fire Services' | 'Structural'>('Architectural');
  const [dwgNo, setDwgNo] = useState('');
  const [dwgRev, setDwgRev] = useState('A');
  const [dwgArea, setDwgArea] = useState('');
  const [isUploadingDwg, setIsUploadingDwg] = useState(false);
  const [dwgExtracting, setDwgExtracting] = useState(false);
  const [selectedDwg, setSelectedDwg] = useState<any | null>(null);

  // Vision Timeline States
  const [visionAssetId, setVisionAssetId] = useState('');
  const [visionDate, setVisionDate] = useState(new Date().toISOString().split('T')[0]);
  const [visionCondition, setVisionCondition] = useState('Good');
  const [visionNotes, setVisionNotes] = useState('');
  const [visionFileUrl, setVisionFileUrl] = useState<string | null>(null);
  const [isUploadingVision, setIsUploadingVision] = useState(false);
  const [degradationResult, setDegradationResult] = useState<any | null>(null);
  const [isAnalyzingDegradation, setIsAnalyzingDegradation] = useState(false);

  // Work Order Form States
  const [woTicketNo, setWoTicketNo] = useState('');
  const [woAssetId, setWoAssetId] = useState('');
  const [woAssetName, setWoAssetName] = useState('');
  const [woRoomName, setWoRoomName] = useState('');
  const [woCategory, setWoCategory] = useState('HVAC');
  const [woDescription, setWoDescription] = useState('');
  const [woCost, setWoCost] = useState('');
  const [woMaintenanceType, setWoMaintenanceType] = useState<'Corrective' | 'Preventive' | 'Emergency'>('Corrective');
  const [woDateOpened, setWoDateOpened] = useState(new Date().toISOString().split('T')[0]);
  const [woStatus, setWoStatus] = useState<'Open' | 'Completed' | 'In Progress'>('Completed');
  const [isAnalyzingWO, setIsAnalyzingWO] = useState(false);
  const [woAnalysisResult, setWoAnalysisResult] = useState<any | null>(null);

  const allAssets = useMemo(() => {
    return rooms.flatMap(r => 
      (r.assets || []).map(a => ({
        id: a.id,
        name: a.name,
        roomName: r.roomName,
        category: a.category,
        currentCondition: a.condition
      }))
    );
  }, [rooms]);

  const computedGraph = useMemo(() => {
    const rawGraph = osState.cogneeGraph;
    let graph: CogneeGraphState;
    
    // If not manually cognified or empty, deterministically compile from multi-modal domain state
    if (!rawGraph || !rawGraph.nodes || rawGraph.nodes.length === 0) {
      graph = compileFacilityKnowledgeGraph(
        siteInfo,
        rooms,
        osState.workOrders || [],
        osState.asBuiltDrawings || []
      );
    } else {
      graph = rawGraph;
    }

    return {
      ...graph,
      nodes: computeGraphLayout(graph.nodes, graph.edges)
    };
  }, [osState.cogneeGraph, rooms, osState.workOrders, osState.asBuiltDrawings, siteInfo]);

  // Dynamic Domino / Cascade Risk Propagation calculation directly on Graph topology
  const cascadeRiskResults: GraphCascadeRiskResult[] = useMemo(() => {
    return analyzeGraphRiskPropagation(computedGraph, rooms);
  }, [computedGraph, rooms]);

  const handleAsBuiltUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDwg(true);
    setDwgExtracting(true);
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          
          // Call Gemini Service to analyze drawing
          const analysis = await analyzeAsBuiltDrawing(dataUrl, file.type, dwgDiscipline);
          
          const newDwg: AsBuiltDrawing = {
            id: crypto.randomUUID(),
            name: file.name,
            drawingNo: dwgNo || 'DWG-' + Math.floor(1000 + Math.random() * 9000),
            revision: dwgRev || '0',
            discipline: dwgDiscipline,
            areaFloor: dwgArea || 'All Areas',
            summary: analysis.summary,
            dateAdded: Date.now(),
            dataUrl,
            detectedEquipment: analysis.detectedEquipment
          };

          const updatedDrawings = [newDwg, ...(osState.asBuiltDrawings || [])];
          
          // Also seed a memory inside the Second Brain that this drawing was parsed!
          const drawingMemoryText = `As-built blueprint "${newDwg.drawingNo}" (Discipline: ${newDwg.discipline}, Rev: ${newDwg.revision}) successfully loaded. Identified key components: ${analysis.detectedEquipment.join(', ')}.`;
          const updatedMemories: AgentMemoryItem[] = [{
            id: crypto.randomUUID(),
            category: 'site_fact',
            text: drawingMemoryText,
            timestamp: Date.now()
          }, ...osState.memories];

          const updatedOS = {
            ...osState,
            asBuiltDrawings: updatedDrawings,
            memories: updatedMemories
          };
          
          updateOSState(updatedOS);
          
          // Reset inputs
          setDwgNo('');
          setDwgRev('A');
          setDwgArea('');
          setSelectedDwg(newDwg);
        } catch (innerErr) {
          console.error("Error analyzing drawing:", innerErr);
          notify("Failed to analyze drawing file. Please try again.", "error");
        } finally {
          setDwgExtracting(false);
          setIsUploadingDwg(false);
        }
      };
      reader.onerror = () => {
        notify("Failed to read drawing file.", "error");
        setDwgExtracting(false);
        setIsUploadingDwg(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setDwgExtracting(false);
      setIsUploadingDwg(false);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleVisionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingVision(true);
    const reader = new FileReader();
    reader.onload = () => {
      setVisionFileUrl(reader.result as string);
      setIsUploadingVision(false);
    };
    reader.onerror = () => {
      notify("Failed to read image file.", "error");
      setIsUploadingVision(false);
    };
    reader.readAsDataURL(file);
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleAddVisionCapture = () => {
    if (!visionAssetId || !visionFileUrl) {
      notify("Please select an asset and upload a photo.", "warning");
      return;
    }
    
    const asset = allAssets.find(a => a.id === visionAssetId);
    if (!asset) return;

    const newCapture: HistoricalVisionCapture = {
      id: crypto.randomUUID(),
      assetId: visionAssetId,
      assetName: asset.name,
      dateCaptured: visionDate,
      condition: visionCondition,
      notes: visionNotes || 'Routine visual tracking.',
      dataUrl: visionFileUrl
    };

    const updatedCaptures = [newCapture, ...(osState.historicalVisionCaptures || [])];
    
    // Seed a memory about this historic capture
    const captureMemoryText = `Recorded historical visual checkpoint for "${asset.name}" on ${visionDate}. Condition registered as "${visionCondition}": ${newCapture.notes}`;
    const updatedMemories: AgentMemoryItem[] = [{
      id: crypto.randomUUID(),
      category: 'observation',
      text: captureMemoryText,
      timestamp: Date.now()
    }, ...osState.memories];

    const updatedOS = {
      ...osState,
      historicalVisionCaptures: updatedCaptures,
      memories: updatedMemories
    };

    updateOSState(updatedOS);
    
    // Reset inputs
    setVisionNotes('');
    setVisionFileUrl(null);
    // Auto-trigger degradation analysis
    runDegradationAnalysis(visionAssetId, updatedCaptures);
  };

  const runDegradationAnalysis = async (assetId: string, customCaptures?: any[]) => {
    const targetAsset = allAssets.find(a => a.id === assetId);
    if (!targetAsset) return;

    const captures = (customCaptures || osState.historicalVisionCaptures || [])
      .filter((c: any) => c.assetId === assetId)
      .sort((a: any, b: any) => new Date(a.dateCaptured).getTime() - new Date(b.dateCaptured).getTime());

    if (captures.length === 0) return;

    setIsAnalyzingDegradation(true);
    try {
      const result = await analyzeHistoricalVisionDegradation(
        targetAsset.name,
        targetAsset.category,
        targetAsset.currentCondition,
        captures.map((c: any) => ({
          dateCaptured: c.dateCaptured,
          condition: c.condition,
          notes: c.notes
        }))
      );
      setDegradationResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzingDegradation(false);
    }
  };

  const handleAddWorkOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const costNum = Number(woCost) || 0;
    
    // Find asset name if selected
    let selectedAssetName = woAssetName || 'Unspecified Asset';
    let finalRoomName = woRoomName || 'All areas';
    let finalCategory = woCategory;
    if (woAssetId) {
      const match = allAssets.find(a => a.id === woAssetId);
      if (match) {
        selectedAssetName = match.name;
        finalRoomName = match.roomName;
        finalCategory = match.category;
      }
    }

    const newWO: WorkOrder = {
      id: crypto.randomUUID(),
      ticketNo: woTicketNo || 'WO-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      assetId: woAssetId || undefined,
      assetName: selectedAssetName,
      roomName: finalRoomName,
      category: finalCategory,
      description: woDescription || 'General corrective maintenance action.',
      cost: costNum,
      maintenanceType: woMaintenanceType,
      dateOpened: woDateOpened,
      status: woStatus
    };

    const updatedOS = {
      ...osState,
      workOrders: [newWO, ...(osState.workOrders || [])]
    };

    updateOSState(updatedOS);

    // Reset inputs
    setWoTicketNo('');
    setWoAssetId('');
    setWoAssetName('');
    setWoRoomName('');
    setWoDescription('');
    setWoCost('');
    setWoMaintenanceType('Corrective');
    setWoStatus('Completed');
  };

  const handleDeleteWorkOrder = (id: string) => {
    const updatedOS = {
      ...osState,
      workOrders: (osState.workOrders || []).filter(wo => wo.id !== id)
    };
    updateOSState(updatedOS);
  };

  const handleSeedDemoWorkOrders = () => {
    // Check if we have assets to link. If not, we will link using text assets
    const ahuAsset = allAssets.find(a => a.category === 'HVAC');
    const plumbingAsset = allAssets.find(a => a.category === 'Plumbing');

    const demoWOs: WorkOrder[] = [
      {
        id: crypto.randomUUID(),
        ticketNo: 'WO-2026-001',
        assetId: ahuAsset?.id,
        assetName: ahuAsset ? ahuAsset.name : 'AHU-01 Central Air Handler',
        roomName: ahuAsset ? ahuAsset.roomName : 'Plant Room 1',
        category: 'HVAC',
        description: 'HVAC fan belt failure and squealing noise. Replaced belt.',
        cost: 450,
        maintenanceType: 'Corrective',
        dateOpened: '2026-01-10',
        status: 'Completed'
      },
      {
        id: crypto.randomUUID(),
        ticketNo: 'WO-2026-002',
        assetId: ahuAsset?.id,
        assetName: ahuAsset ? ahuAsset.name : 'AHU-01 Central Air Handler',
        roomName: ahuAsset ? ahuAsset.roomName : 'Plant Room 1',
        category: 'HVAC',
        description: 'AC compressor overheating, air flow not cooling. Refilled refrigerant and cleaned coils.',
        cost: 850,
        maintenanceType: 'Corrective',
        dateOpened: '2026-02-15',
        status: 'Completed'
      },
      {
        id: crypto.randomUUID(),
        ticketNo: 'WO-2026-003',
        assetId: plumbingAsset?.id,
        assetName: plumbingAsset ? plumbingAsset.name : 'Under-sink copper piping',
        roomName: plumbingAsset ? plumbingAsset.roomName : 'Main Restroom',
        category: 'Plumbing',
        description: 'Minor pipe leakage and staining. Wrapped and patched with copper sealant tape.',
        cost: 250,
        maintenanceType: 'Corrective',
        dateOpened: '2026-02-28',
        status: 'Completed'
      },
      {
        id: crypto.randomUUID(),
        ticketNo: 'WO-2026-004',
        assetId: ahuAsset?.id,
        assetName: ahuAsset ? ahuAsset.name : 'AHU-01 Central Air Handler',
        roomName: ahuAsset ? ahuAsset.roomName : 'Plant Room 1',
        category: 'HVAC',
        description: 'AC fan belt snapped again and unit blowing warm air. Replaced belt and tightened pulley mechanism.',
        cost: 500,
        maintenanceType: 'Emergency',
        dateOpened: '2026-04-05',
        status: 'Completed'
      },
      {
        id: crypto.randomUUID(),
        ticketNo: 'WO-2026-005',
        assetId: plumbingAsset?.id,
        assetName: plumbingAsset ? plumbingAsset.name : 'Under-sink copper piping',
        roomName: plumbingAsset ? plumbingAsset.roomName : 'Main Restroom',
        category: 'Plumbing',
        description: 'Pipe leaking again in multiple spots, staining wall boards. Wrapped joint and applied secondary clamp.',
        cost: 355,
        maintenanceType: 'Corrective',
        dateOpened: '2026-04-20',
        status: 'Completed'
      },
      {
        id: crypto.randomUUID(),
        ticketNo: 'WO-2026-006',
        assetId: ahuAsset?.id,
        assetName: ahuAsset ? ahuAsset.name : 'AHU-01 Central Air Handler',
        roomName: ahuAsset ? ahuAsset.roomName : 'Plant Room 1',
        category: 'HVAC',
        description: 'Compressor locked up, tripped main panel circuit breaker. Swapped run capacitor temporarily.',
        cost: 1200,
        maintenanceType: 'Emergency',
        dateOpened: '2026-05-12',
        status: 'Completed'
      },
      {
        id: crypto.randomUUID(),
        ticketNo: 'WO-2026-007',
        assetId: undefined,
        assetName: 'Server Room split AC unit',
        roomName: 'Server Suite',
        category: 'HVAC',
        description: 'Routine quarterly air filter swap and diagnostic review.',
        cost: 150,
        maintenanceType: 'Preventive',
        dateOpened: '2026-06-01',
        status: 'Completed'
      }
    ];

    const updatedOS = {
      ...osState,
      workOrders: [...demoWOs, ...(osState.workOrders || [])]
    };
    updateOSState(updatedOS);
  };

  const runJarvisWorkOrderAudit = async () => {
    const wos = osState.workOrders || [];
    if (wos.length === 0) {
      notify("Please log or seed some Work Orders before running the Jarvis Audit.", "warning");
      return;
    }

    setIsAnalyzingWO(true);
    setWoAnalysisResult(null);

    try {
      const assetsForPrompt = rooms.flatMap(r => 
        (r.assets || []).map(a => ({
          id: a.id,
          name: a.name,
          category: a.category,
          roomName: r.roomName,
          cost: a.cost,
          condition: a.condition
        }))
      );

      const result = await analyzeWorkOrdersForCapexOrRework(
        wos,
        assetsForPrompt,
        osState.customRules,
        osState.memories.map(m => m.text)
      );

      setWoAnalysisResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzingWO(false);
    }
  };

  const docName = (id: string) => {
    const doc = siteInfo.documents?.find((d: any) => d.id === id);
    return doc ? doc.name : 'Uploaded Document';
  };

  const runPMReportAnalysis = async (dataUrl: string, mimeType: string, fileName: string) => {
    setIsAnalyzingPM(true);
    setTuningSuccessMsg(null);
    setProposedUpdates([]);

    try {
      // Extract flattened current assets for the prompt
      const currentAssetsList = rooms.flatMap(r => 
        (r.assets || []).map(a => ({
          id: a.id,
          name: a.name,
          category: a.category,
          roomName: r.roomName,
          currentCondition: a.condition
        }))
      );

      if (currentAssetsList.length === 0) {
        notify("No assets found in the inventory. Please create or import some assets first.", "warning");
        setIsAnalyzingPM(false);
        return;
      }

      const results = await analyzePMReportAndMapConditions(dataUrl, mimeType, fileName, currentAssetsList);
      setProposedUpdates(results);
      
      // Select all by default
      const initialSelection: Record<string, boolean> = {};
      results.forEach(u => {
        initialSelection[u.assetId] = true;
      });
      setSelectedUpdates(initialSelection);
    } catch (err) {
      console.error(err);
      notify("Failed to analyze PM report. Please ensure the API is configured correctly.", "error");
    } finally {
      setIsAnalyzingPM(false);
    }
  };

  const handlePMDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          
          // Save to site documents
          const newDoc = {
            id: crypto.randomUUID(),
            name: file.name,
            summary: `Direct PM upload for condition auto-tuning.`,
            dateAdded: Date.now(),
            dataUrl,
            mimeType: file.type
          };
          
          const updatedDocs = [...(siteInfo.documents || []), newDoc];
          onUpdateSiteInfo('documents', updatedDocs);
          setSelectedDocId(newDoc.id);

          await runPMReportAnalysis(dataUrl, file.type, file.name);
        } catch (innerErr) {
          console.error("Error analyzing PM report:", innerErr);
          notify("Failed to analyze PM report file.", "error");
        }
      };
      reader.onerror = () => {
        notify("Failed to read PM report file.", "error");
        setIsAnalyzingPM(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsAnalyzingPM(false);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleAnalyzeExistingDoc = async () => {
    if (!selectedDocId) return;
    const doc = siteInfo.documents?.find((d: any) => d.id === selectedDocId);
    if (!doc) return;

    await runPMReportAnalysis(doc.dataUrl, doc.mimeType, doc.name);
  };

  const handleApplyUpdates = () => {
    if (!onUpdateRooms) {
      notify("Asset updating is not available in the current context.", "warning");
      return;
    }

    const updatesToApply = proposedUpdates.filter(u => selectedUpdates[u.assetId]);
    if (updatesToApply.length === 0) {
      notify("No updates selected.", "warning");
      return;
    }

    // Clone rooms and apply changes
    const updatedRooms = rooms.map(room => {
      const updatedAssets = (room.assets || []).map(asset => {
        const update = updatesToApply.find(u => u.assetId === asset.id);
        if (update) {
          // Add audit entry
          const auditTrail = [...(asset.auditTrail || [])];
          auditTrail.push({
            timestamp: Date.now(),
            actor: 'AI' as const,
            action: 'Condition Auto-Rated',
            details: `Automated rating change from ${asset.condition} to ${update.proposedCondition} via PM Report Analysis. Justification: ${update.justification}`
          });

          // Add risk history if risk rating changed
          const riskHistory = [...(asset.riskHistory || [])];
          if (asset.riskRating && asset.riskRating !== update.proposedRisk) {
            riskHistory.push({
              timestamp: Date.now(),
              actor: 'AI' as const,
              previousRisk: asset.riskRating,
              newRisk: update.proposedRisk
            });
          }

          return {
            ...asset,
            condition: update.proposedCondition,
            riskRating: update.proposedRisk,
            justification: `${update.justification} (Aligned via PM Report: ${docName(selectedDocId)})`,
            riskHistory,
            auditTrail
          };
        }
        return asset;
      });
      return { ...room, assets: updatedAssets };
    });

    // Create episodic memories for Second Brain
    const newMemories: AgentMemoryItem[] = updatesToApply.map(update => ({
      id: crypto.randomUUID(),
      category: 'observation',
      text: `Condition of "${update.category}" asset in "${update.roomName}" auto-adjusted to "${update.proposedCondition}" based on PM service log diagnostics.`,
      timestamp: Date.now()
    }));

    onUpdateRooms(updatedRooms);
    
    const updatedOS = {
      ...osState,
      memories: [...newMemories, ...osState.memories]
    };
    updateOSState(updatedOS);

    setTuningSuccessMsg(`Successfully applied ${updatesToApply.length} condition and risk level adjustments to physical assets!`);
    setProposedUpdates([]);
  };

  // Synchronize OS state changes to main app state and Firestore
  const updateOSState = (newOSState: AgentOSState) => {
    setOsState(newOSState);
    onUpdateSiteInfo('agentOS', newOSState);
  };

  // Trigger Cognee Cognify step to build/enrich knowledge graph
  const handleCognify = async () => {
    setIsCognifying(true);
    setCognifyLogs([
      "Initializing Cognee Semantic Pipeline...",
      "Defining Ontological Schemas for Facility Management (ISO 55001)...",
      "Scanning active rooms, equipment inventories, and maintenance work orders..."
    ]);

    try {
      await new Promise(resolve => setTimeout(resolve, 600));
      setCognifyLogs(prev => [...prev, "Compiling baseline nodes for structural spaces and systems..."]);
      
      if (unstructuredCogneeText) {
        await new Promise(resolve => setTimeout(resolve, 800));
        setCognifyLogs(prev => [...prev, "Piping unstructured site guidelines and manual text to Gemini semantic extractor..."]);
      }

      const graph = await cognifyDataSources(
        unstructuredCogneeText ? [unstructuredCogneeText] : [],
        rooms,
        osState.workOrders || [],
        osState.memories || []
      );

      await new Promise(resolve => setTimeout(resolve, 600));
      setCognifyLogs(prev => [...prev, `Found ${graph.nodes.length} entity nodes and ${graph.edges.length} relationships.`]);
      setCognifyLogs(prev => [...prev, "Normalizing graph topology and saving semantic memory vector space..."]);
      
      const updatedOS = {
        ...osState,
        cogneeGraph: graph
      };
      updateOSState(updatedOS);

      await new Promise(resolve => setTimeout(resolve, 400));
      setCognifyLogs(prev => [...prev, "🚀 Cognee Graph compilation complete! Your AI Agent OS now runs on a fully queryable Semantic Brain."]);
    } catch (err) {
      console.error("Cognee compiler failed:", err);
      setCognifyLogs(prev => [...prev, "❌ Pipeline failed: Unhandled semantic parsing error."]);
    } finally {
      setIsCognifying(false);
    }
  };

  // Run graph-grounded query
  const handleQueryCognee = async () => {
    if (!cogneeSearchQuery.trim()) return;
    setIsQueryingGraph(true);
    setGraphQueryResponse(null);

    let currentGraph = osState.cogneeGraph;
    if (!currentGraph || !currentGraph.nodes || currentGraph.nodes.length === 0) {
      currentGraph = computedGraph;
    }

    try {
      try {
        const response = await queryCogneeGraph(cogneeSearchQuery, currentGraph);
        setGraphQueryResponse(response);
        
        if (response.traversedNodes && response.traversedNodes.length > 0) {
          setSelectedNodeId(response.traversedNodes[0]);
        }
      } catch (geminiError) {
        console.warn("AI graph query fallback to deterministic engine:", geminiError);
        const deterministicResponse = queryKnowledgeGraph(currentGraph, cogneeSearchQuery);
        setGraphQueryResponse(deterministicResponse);
        if (deterministicResponse.traversedNodes && deterministicResponse.traversedNodes.length > 0) {
          setSelectedNodeId(deterministicResponse.traversedNodes[0]);
        }
      }
    } catch (error) {
      console.error("Semantic query failed:", error);
    } finally {
      setIsQueryingGraph(false);
    }
  };

  // Auto-seed memories from current assets if memory is empty
  useEffect(() => {
    if (osState.memories.length === 0 && rooms.length > 0) {
      const seededMemories: AgentMemoryItem[] = [];
      
      // Add basic site profile memory
      if (siteInfo.name) {
        seededMemories.push({
          id: `seed-site-${Date.now()}`,
          category: 'site_fact',
          text: `Asset facility established as "${siteInfo.name}" located at ${siteInfo.address || 'unspecified geographic coordinates'}.`,
          timestamp: Date.now()
        });
      }

      // Add assets observations
      rooms.forEach((room) => {
        if (room.assets && room.assets.length > 0) {
          room.assets.forEach((asset) => {
            if (asset.condition && asset.riskRating) {
              seededMemories.push({
                id: `seed-asset-${asset.id}`,
                category: 'observation',
                text: `In "${room.roomName}", detected asset "${asset.category}" with condition "${asset.condition}" and risk classification "${asset.riskRating}".`,
                timestamp: Date.now() - 5000
              });
            }
          });
        }
      });

      if (seededMemories.length > 0) {
        updateOSState({
          ...osState,
          memories: seededMemories
        });
      }
    }
  }, [rooms, siteInfo.name]);

  // Handle adding memories manually
  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;

    const newItem: AgentMemoryItem = {
      id: crypto.randomUUID(),
      category: newMemoryCategory,
      text: newMemoryText.trim(),
      timestamp: Date.now()
    };

    const updatedOS = {
      ...osState,
      memories: [newItem, ...osState.memories]
    };
    
    updateOSState(updatedOS);
    setNewMemoryText('');
  };

  // Handle deleting memories
  const handleDeleteMemory = (id: string) => {
    const updatedOS = {
      ...osState,
      memories: osState.memories.filter(m => m.id !== id)
    };
    updateOSState(updatedOS);
  };

  // Handle adding custom rules
  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleText.trim()) return;

    const updatedOS = {
      ...osState,
      customRules: [...osState.customRules, newRuleText.trim()]
    };

    updateOSState(updatedOS);
    setNewRuleText('');
  };

  // Handle deleting custom rules
  const handleDeleteRule = (index: number) => {
    const updatedOS = {
      ...osState,
      customRules: osState.customRules.filter((_, idx) => idx !== index)
    };
    updateOSState(updatedOS);
  };

  // Toggle active skills
  const handleToggleSkill = (skillId: string) => {
    const updatedOS = {
      ...osState,
      skills: osState.skills.map(s => s.id === skillId ? { ...s, enabled: !s.enabled } : s)
    };
    updateOSState(updatedOS);
  };

  // Run skill simulation
  const runSkillWorkflow = (skillId: string) => {
    if (isExecuting) return;
    
    setActiveSkillId(skillId);
    setIsExecuting(true);
    setExecutionResult(null);
    setTerminalLogs([]);

    const logLine = (msg: string, delay: number) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
          resolve();
        }, delay);
      });
    };

    const execute = async () => {
      await logLine(`Initializing cognitive skill core: "${skillId.toUpperCase()}"`, 200);
      await logLine("Accessing AI Second Brain knowledge logs...", 400);
      await logLine(`Loaded ${osState.memories.length} episodic memories & ${osState.customRules.length} strategic guardrails.`, 300);
      await logLine(`Reading standard physical inventory: ${rooms.length} active zones found.`, 300);

      // Extract all current assets
      const allAssets: { asset: Asset; roomName: string }[] = [];
      rooms.forEach(r => {
        if (r.assets) {
          r.assets.forEach(a => allAssets.push({ asset: a, roomName: r.roomName }));
        }
      });

      await logLine(`Identified ${allAssets.length} unique physical assets in inspection schema.`, 400);

      if (skillId === 'compliance') {
        await logLine("Parsing inventory against ISO 55001:2024 compliance indices...", 500);
        await logLine("Matching active rules: 'Check Remaining Useful Life (RUL)'", 400);
        await logLine("Clause 8.1 - Asset Lifecycle Planning: Evaluated.", 450);
        await logLine("Clause 9.1 - Monitoring and Performance: Evaluated.", 350);
        await logLine("Compilation complete. Constructing visual compliance ledger...", 400);

        // Generate mock-real results based on actual inventory
        const nonCompliant = allAssets.filter(item => !item.asset.rul || parseFloat(item.asset.rul) <= 0);
        const lowCondition = allAssets.filter(item => item.asset.condition === 'Poor' || item.asset.condition === 'Bad');
        
        const issues = [];
        if (nonCompliant.length > 0) {
          issues.push({
            id: 'iso-55001-8.1',
            title: 'Missing/Invalid Remaining Useful Life (RUL) Plan',
            description: `ISO 55001 Clause 8.1 requires clear lifecycle operational plans. Found ${nonCompliant.length} assets with undefined or expired RUL values.`,
            severity: 'Medium',
            assets: nonCompliant.map(i => `${i.roomName} - ${i.asset.category}`)
          });
        }
        if (lowCondition.length > 0) {
          issues.push({
            id: 'iso-55001-9.1',
            title: 'Sub-Standard Operational Performance Threshold',
            description: `Clause 9.1 mandates continuous condition oversight. Detected ${lowCondition.length} assets in Poor condition with extreme wear risk.`,
            severity: 'High',
            assets: lowCondition.map(i => `${i.roomName} - ${i.asset.category}`)
          });
        }

        if (issues.length === 0) {
          issues.push({
            id: 'iso-55001-5.1',
            title: 'All Logged Assets Compliant',
            description: 'All listed physical items satisfy basic asset planning guidelines with valid condition classifications and remaining life records.',
            severity: 'Passed',
            assets: []
          });
        }

        setTimeout(() => {
          setIsExecuting(false);
          setExecutionResult({
            type: 'compliance',
            conformanceScore: Math.round(100 - (issues.length * 15)),
            issues
          });
        }, 1200);

      } else if (skillId === 'finance') {
        await logLine("Initializing AI CFO Cognitive Core & Strategic Capital Allocator...", 400);
        await logLine("Extracting physical asset registers & replacement valuations...", 300);
        await logLine("Injecting custom strategic guardrails and auxiliary memories...", 300);
        await logLine("Connecting to Gemini 3.5 Corporate Finance & Risk Engine...", 400);
        await logLine("Synthesizing multi-scenario replacements (Base, Accelerated Wear, Inflation-Adjusted)...", 500);
        await logLine("Calculating asset risk concentration and strategic monthly allocations...", 400);
        await logLine("Formatting dynamic dashboards & CFO-ready strategic advisory...", 300);

        try {
          const formattedAssets = allAssets.map(item => ({
            id: item.asset.id,
            name: item.asset.name,
            category: item.asset.category,
            roomName: item.roomName,
            condition: item.asset.condition,
            cost: item.asset.cost,
            rul: item.asset.rul,
            age: item.asset.age || "Unknown",
            riskRating: item.asset.riskRating || "Medium"
          }));

          const cfoResult = await analyzeCFOFinance(
            formattedAssets,
            osState.customRules,
            osState.memories.map(m => m.text)
          );

          setIsExecuting(false);
          setExecutionResult({
            type: 'finance',
            ...cfoResult
          });
        } catch (err) {
          console.error("CFO Analysis failed:", err);
          await logLine("Error in AI CFO pipeline. Initiating fallback computation engine...", 200);
          
          let totalCost = 0;
          let immediateCAPEX = 0;
          let shortTermCAPEX = 0;
          let mediumTermCAPEX = 0;

          allAssets.forEach(item => {
            const cost = parseFloat(item.asset.cost) || 0;
            const rul = parseFloat(item.asset.rul) || 5;
            totalCost += cost;

            if (rul <= 2) {
              immediateCAPEX += cost;
            } else if (rul <= 5) {
              shortTermCAPEX += cost;
            } else {
              mediumTermCAPEX += cost;
            }
          });

          if (totalCost === 0) {
            totalCost = 250000;
            immediateCAPEX = 45000;
            shortTermCAPEX = 85000;
            mediumTermCAPEX = 120000;
          }

          setIsExecuting(false);
          setExecutionResult({
            type: 'finance',
            executiveSummary: "Fallback AI CFO Summary: Real-time API connection was interrupted. Based on linear calculations, your portfolio has a total asset value of $" + totalCost.toLocaleString() + ". Recommend prioritizing immediate capital reserve allocation to mitigate upcoming asset life expiry.",
            totalAssetValue: totalCost,
            immediateCAPEX: immediateCAPEX,
            shortTermCAPEX: shortTermCAPEX,
            mediumTermCAPEX: mediumTermCAPEX,
            monthlyAllocation: Math.round((immediateCAPEX + shortTermCAPEX * 0.5) / 36),
            riskConcentrationPercentage: 15,
            scenarios: [
              { year: '2026', baseAmount: Math.round(immediateCAPEX * 0.4), stressAmount: Math.round(immediateCAPEX * 0.5), inflationAmount: Math.round(immediateCAPEX * 0.42) },
              { year: '2027', baseAmount: Math.round(immediateCAPEX * 0.6), stressAmount: Math.round(immediateCAPEX * 0.8), inflationAmount: Math.round(immediateCAPEX * 0.65) },
              { year: '2028', baseAmount: Math.round(shortTermCAPEX * 0.3), stressAmount: Math.round(shortTermCAPEX * 0.4), inflationAmount: Math.round(shortTermCAPEX * 0.34) },
              { year: '2029', baseAmount: Math.round(shortTermCAPEX * 0.3), stressAmount: Math.round(shortTermCAPEX * 0.4), inflationAmount: Math.round(shortTermCAPEX * 0.35) },
              { year: '2030', baseAmount: Math.round(shortTermCAPEX * 0.4), stressAmount: Math.round(shortTermCAPEX * 0.5), inflationAmount: Math.round(shortTermCAPEX * 0.49) },
              { year: '2031', baseAmount: mediumTermCAPEX, stressAmount: Math.round(mediumTermCAPEX * 1.2), inflationAmount: Math.round(mediumTermCAPEX * 1.26) }
            ],
            criticalAssets: allAssets.slice(0, 3).map(item => ({
              assetId: item.asset.id,
              assetName: item.asset.name,
              roomName: item.roomName,
              cost: parseFloat(item.asset.cost) || 3000,
              condition: item.asset.condition,
              riskRating: item.asset.riskRating || 'Medium',
              score: (parseFloat(item.asset.cost) || 3000) * (item.asset.riskRating === 'Extreme' ? 10 : item.asset.riskRating === 'High' ? 6 : 3) / 1000
            })),
            alerts: [
              { id: 'err-alert-1', type: 'warning', title: 'Calculated Capex Reserve Required', message: "Immediate capex requirements total $" + immediateCAPEX.toLocaleString() + " over 24 months." }
            ]
          });
        }

      } else if (skillId === 'risk') {
        await logLine("Bootstrapping Risk Mitigation Planner engine...", 450);
        await logLine("Evaluating active room hazards and wall segment ratings...", 450);
        await logLine("Analyzing user custom rule: 'Flag concrete wet-room structures'...", 350);
        await logLine("Risk mitigation vector generation: complete.", 400);

        const highRiskItems = allAssets.filter(i => i.asset.riskRating === 'High' || i.asset.riskRating === 'Extreme');
        const mitigations = highRiskItems.map(item => {
          let advice = "Schedule prompt engineering inspection. Isolate asset core if necessary.";
          if (item.asset.category.toLowerCase().includes('concrete') || item.asset.category.toLowerCase().includes('wall')) {
            advice = "Inject epoxy sealant to arrest macro-fracturing. Implement structural crack monitoring gauges.";
          } else if (item.asset.category.toLowerCase().includes('electrical') || item.asset.category.toLowerCase().includes('power')) {
            advice = "De-energize node instantly. Retrace load profiles and replace critical thermal switchgears.";
          } else if (item.asset.category.toLowerCase().includes('fire') || item.asset.category.toLowerCase().includes('extinguisher')) {
            advice = "Replace pressure gauge and re-tag within 48 hours to satisfy safety regulations.";
          }
          return {
            assetName: `${item.roomName} - ${item.asset.category}`,
            rating: item.asset.riskRating,
            mitigation: advice
          };
        });

        if (mitigations.length === 0) {
          mitigations.push({
            assetName: "General Facility Integrity",
            rating: "Low",
            mitigation: "Continue routine quarterly physical walkthroughs. Maintain operational memory log intact."
          });
        }

        setTimeout(() => {
          setIsExecuting(false);
          setExecutionResult({
            type: 'risk',
            severityCount: highRiskItems.length,
            mitigations
          });
        }, 1200);
      }
    };

    execute();
  };

  // Filter memories based on search
  const filteredMemories = useMemo(() => {
    return osState.memories.filter(m => 
      m.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [osState.memories, searchTerm]);

  return (
    <div id="ai-agent-os-container" className="flex flex-col gap-6 py-4 animate-fade-in text-gray-900 pb-16">
      
      {/* OS Header with Status indicators */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        {/* Animated matrix dots */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#33415510_1px,transparent_1px),linear-gradient(to_bottom,#33415510_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center gap-4 z-10">
          <div className="p-3.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Cpu className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-extrabold tracking-tight">AI Agent OS & Second Brain Hub</h2>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Supercharging the local inspector agent with a persistent episodic knowledge database, custom strategic rules, and real-time execution pipelines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 z-10">
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-750 text-center min-w-[90px]">
            <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">Memories</div>
            <div className="text-xl font-extrabold text-indigo-400 mt-0.5">{osState.memories.length}</div>
          </div>
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-750 text-center min-w-[90px]">
            <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">Rules</div>
            <div className="text-xl font-extrabold text-amber-400 mt-0.5">{osState.customRules.length}</div>
          </div>
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-750 text-center min-w-[90px]">
            <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">Skills Active</div>
            <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
              {osState.skills.filter(s => s.enabled).length}/4
            </div>
          </div>
        </div>
      </div>

      {/* PM & Work Order Auto-Tuning Core */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-150 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-gray-950 flex items-center gap-2">
                PM & Work Order Auto-Tuning Core
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Predictive Engine</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Upload preventive maintenance checklists or work histories. The cognitive engine parses service results per category (HVAC, Fire, Electrical) and maps them directly to your active condition ratings.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-gray-150">
          {/* Option 1: Choose existing document */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-gray-700">Select Existing Inspection Document</span>
            <div className="flex gap-2">
              <select
                value={selectedDocId}
                onChange={(e) => {
                  setSelectedDocId(e.target.value);
                  setTuningSuccessMsg(null);
                  setProposedUpdates([]);
                }}
                className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">-- Choose document --</option>
                {siteInfo.documents?.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name} ({new Date(d.dateAdded).toLocaleDateString()})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAnalyzeExistingDoc}
                disabled={!selectedDocId || isAnalyzingPM}
                className="bg-slate-900 hover:bg-slate-800 text-white disabled:bg-gray-200 disabled:text-gray-400 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer"
              >
                {isAnalyzingPM ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Analyze Log
              </button>
            </div>
          </div>

          {/* Option 2: Upload direct file */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-gray-700">Upload New PM Report / Service Sheet</span>
            <div className="flex gap-2">
              <div
                className="relative overflow-hidden flex-1 bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/20 text-gray-600 rounded-xl px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition border-dashed"
              >
                <input
                  type="file"
                  onChange={handlePMDirectUpload}
                  accept="image/*,application/pdf"
                  disabled={isAnalyzingPM}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <Upload className="w-4 h-4 text-indigo-500" />
                Select & Process PDF / Image
              </div>
            </div>
          </div>
        </div>

        {/* Loading overlay for PM tuning */}
        {isAnalyzingPM && (
          <div className="py-12 flex flex-col items-center justify-center gap-4 text-center animate-pulse">
            <div className="p-4 bg-indigo-50 rounded-full text-indigo-600 animate-bounce">
              <Cpu className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-gray-900">Running Cognitive Asset Matching Pipeline</div>
              <p className="text-xs text-gray-500 mt-1">Extracting technical anomalies, matching category conditions, and preparing alignment logs...</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {tuningSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 flex items-start gap-3 text-xs animate-fade-in">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold block">Tuning Alignment Complete!</span>
              <p className="mt-0.5 font-medium">{tuningSuccessMsg}</p>
            </div>
          </div>
        )}

        {/* Proposed updates table */}
        {proposedUpdates.length > 0 && (
          <div className="flex flex-col gap-4 border border-indigo-100 bg-indigo-50/20 rounded-xl p-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-indigo-100/50 pb-3">
              <div>
                <span className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Proposed Physical Condition Updates
                </span>
                <p className="text-[11px] text-indigo-700/80 mt-0.5">We matched these active assets based on the uploaded log. Select which ones to apply.</p>
              </div>
              <button
                type="button"
                onClick={handleApplyUpdates}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Apply Approved Updates
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-indigo-100 text-[10px] uppercase font-mono tracking-wider text-indigo-900">
                    <th className="py-2.5 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={proposedUpdates.every(u => selectedUpdates[u.assetId])}
                        onChange={(e) => {
                          const val = e.target.checked;
                          const next: Record<string, boolean> = {};
                          proposedUpdates.forEach(u => {
                            next[u.assetId] = val;
                          });
                          setSelectedUpdates(next);
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3">Asset</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3">Condition Delta</th>
                    <th className="py-2.5 px-3">Proposed Risk</th>
                    <th className="py-2.5 px-3">Justification / Diagnostics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50 text-xs">
                  {proposedUpdates.map((update) => (
                    <tr key={update.assetId} className="hover:bg-white/40 transition">
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={!!selectedUpdates[update.assetId]}
                          onChange={(e) => {
                            setSelectedUpdates(prev => ({
                              ...prev,
                              [update.assetId]: e.target.checked
                            }));
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-extrabold text-gray-900 block">{update.assetName}</span>
                        <span className="text-[10px] text-gray-500 font-medium font-mono bg-gray-100 px-1.5 py-0.5 rounded mt-1 inline-block">{update.category}</span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-600">{update.roomName}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 line-through">{update.currentCondition}</span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            update.proposedCondition === 'Good' || update.proposedCondition === 'Excellent' ? 'bg-emerald-100 text-emerald-800' :
                            update.proposedCondition === 'Fair' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {update.proposedCondition}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          update.proposedRisk === 'Low' ? 'bg-emerald-100 text-emerald-800' :
                          update.proposedRisk === 'Medium' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {update.proposedRisk}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-600 max-w-sm italic leading-relaxed">{update.justification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Memories & Strategic Rules (7 Columns) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* AI Second Brain (Persisted episodic memories, As-Builts and Vision timeline) */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-150 p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-extrabold text-gray-950">
                  AI Second Brain (Semantic Knowledge Memory)
                </h3>
              </div>
              
              {/* Tab Toggles */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-gray-200 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setBrainTab('memories')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                    brainTab === 'memories' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Knowledge
                </button>
                <button
                  onClick={() => setBrainTab('asbuilt')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                    brainTab === 'asbuilt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  As-Builts
                </button>
                <button
                  onClick={() => setBrainTab('vision')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                    brainTab === 'vision' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  Vision Vault
                </button>
                <button
                  onClick={() => setBrainTab('workorders')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                    brainTab === 'workorders' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Work Order Hub
                </button>
                <button
                  onClick={() => setBrainTab('cognee')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                    brainTab === 'cognee' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  Cognee Graph
                </button>
              </div>
            </div>

            {/* TAB 1: KNOWLEDGE MEMORIES (ORIGINAL VIEW) */}
            {brainTab === 'memories' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    The Second Brain accumulates and holds episodic facts extracted during inspections. This context is injected directly into model interactions to maintain site awareness.
                  </p>
                  <div className="relative max-w-xs shrink-0">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none w-32 transition-all focus:w-44"
                    />
                  </div>
                </div>

                {/* Memories List */}
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl bg-gray-50/50 pr-1">
                  {filteredMemories.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-2">
                      <Database className="w-8 h-8 text-gray-300 animate-pulse" />
                      {searchTerm ? 'No memory logs match search string.' : 'Cognitive memory log is empty. Seed records below!'}
                    </div>
                  ) : (
                    filteredMemories.map((m) => (
                      <div key={m.id} className="p-3 hover:bg-gray-50 flex items-start justify-between gap-3 group transition">
                        <div className="flex gap-2.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold mt-0.5 tracking-wider h-fit uppercase ${
                            m.category === 'observation' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                            m.category === 'guideline' ? 'bg-sky-100 text-sky-700 border border-sky-200' :
                            'bg-teal-100 text-teal-700 border border-teal-200'
                          }`}>
                            {m.category}
                          </span>
                          <p className="text-xs font-medium text-gray-700 leading-relaxed">{m.text}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteMemory(m.id)}
                          className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-300 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          title="Erase memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Memory Form */}
                <form onSubmit={handleAddMemory} className="flex gap-2 border-t border-gray-100 pt-4 mt-1">
                  <select
                    value={newMemoryCategory}
                    onChange={(e: any) => setNewMemoryCategory(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none text-gray-600 cursor-pointer"
                  >
                    <option value="site_fact">Site Fact</option>
                    <option value="observation">Observation</option>
                    <option value="guideline">Guideline</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Teach your agent a new fact..."
                    value={newMemoryText}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Learn
                  </button>
                </form>
              </>
            )}

            {/* TAB 2: AS-BUILT & ARCHITECTURAL DRAWINGS */}
            {brainTab === 'asbuilt' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <p className="text-xs text-gray-500">
                  Manage construction as-built blueprints and architectural schematics. Upload a blueprint image to analyze structural dimensions, layouts, and automatically detect scheduled mechanical and electrical equipment using Gemini OCR.
                </p>

                {/* Draw Form Upload */}
                <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">Drawing Ingestion Dock</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Drawing No.</label>
                      <input 
                        type="text" 
                        placeholder="e.g. ME-A1-002" 
                        value={dwgNo} 
                        onChange={(e) => setDwgNo(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Revision</label>
                      <input 
                        type="text" 
                        placeholder="e.g. B" 
                        value={dwgRev} 
                        onChange={(e) => setDwgRev(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Discipline</label>
                      <select 
                        value={dwgDiscipline} 
                        onChange={(e: any) => setDwgDiscipline(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-600 font-medium cursor-pointer"
                      >
                        <option value="Architectural">Architectural / Civil</option>
                        <option value="Electrical">Electrical Services</option>
                        <option value="Mechanical">HVAC / Mechanical</option>
                        <option value="Plumbing">Plumbing & Hydraulics</option>
                        <option value="Fire Services">Fire Protection</option>
                        <option value="Structural">Structural Concrete/Steel</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Area / Floor</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Ground Floor, Wing B" 
                        value={dwgArea} 
                        onChange={(e) => setDwgArea(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Uploader File Input */}
                  <div className="mt-2 flex items-center justify-between border-t border-gray-200/60 pt-3">
                    <div className="relative overflow-hidden flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer shadow-sm">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleAsBuiltUpload} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                        disabled={dwgExtracting}
                      />
                      <Upload className="w-4 h-4" />
                      Select drawing image
                    </div>

                    {dwgExtracting && (
                      <span className="text-[11px] font-medium text-indigo-600 animate-pulse flex items-center gap-1.5 font-mono">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        AI extracting blueprint legends...
                      </span>
                    )}
                  </div>
                </div>

                {/* Drawing Lists */}
                <div className="space-y-3">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Indexed Drawings Library ({(osState.asBuiltDrawings || []).length})</div>
                  {(!osState.asBuiltDrawings || osState.asBuiltDrawings.length === 0) ? (
                    <div className="py-8 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 text-gray-300" />
                      No as-built or architectural blueprint schemas saved yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 max-h-72 overflow-y-auto pr-1">
                      {(osState.asBuiltDrawings || []).map((dwg) => (
                        <div 
                          key={dwg.id} 
                          onClick={() => setSelectedDwg(dwg === selectedDwg ? null : dwg)}
                          className={`p-3.5 border rounded-xl transition cursor-pointer flex flex-col gap-2.5 ${
                            selectedDwg?.id === dwg.id 
                              ? 'bg-indigo-50/40 border-indigo-200 shadow-sm' 
                              : 'bg-white border-gray-150 hover:bg-gray-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`p-2 rounded-lg text-xs font-bold font-mono ${
                                dwg.discipline === 'Architectural' ? 'bg-amber-100 text-amber-800' :
                                dwg.discipline === 'Electrical' ? 'bg-sky-100 text-sky-800' :
                                dwg.discipline === 'Mechanical' ? 'bg-teal-100 text-teal-800' :
                                dwg.discipline === 'Plumbing' ? 'bg-emerald-100 text-emerald-800' :
                                dwg.discipline === 'Fire Services' ? 'bg-rose-100 text-rose-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                                {dwg.discipline.substring(0, 4).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                  {dwg.drawingNo}
                                  <span className="text-[10px] font-bold text-slate-400">Rev {dwg.revision}</span>
                                </h4>
                                <p className="text-[10px] text-gray-500 font-medium mt-0.5">{dwg.name} &bull; {dwg.areaFloor}</p>
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono font-medium">{new Date(dwg.dateAdded).toLocaleDateString()}</span>
                          </div>

                          {/* Expanded Detail */}
                          {selectedDwg?.id === dwg.id && (
                            <div className="mt-1.5 border-t border-gray-200/60 pt-3 flex flex-col gap-3 animate-fade-in text-xs">
                              {dwg.dataUrl && (
                                <div className="border border-gray-200 rounded-lg overflow-hidden h-40 bg-slate-100 flex items-center justify-center">
                                  <img 
                                    src={dwg.dataUrl} 
                                    alt={dwg.name} 
                                    className="max-h-full max-w-full object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              )}
                              <div className="bg-slate-50 border border-gray-100 rounded-lg p-3 text-slate-700 leading-relaxed italic text-[11px]">
                                &ldquo;{dwg.summary}&rdquo;
                              </div>

                              <div className="space-y-1.5">
                                <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider font-mono">Extracted Assets / Components:</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(dwg.detectedEquipment || []).map((eq, i) => (
                                    <span key={i} className="bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold shadow-2xs">
                                      {eq}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: HISTORICAL VISION TIMELINE & CONDITION DEGRADATION */}
            {brainTab === 'vision' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <p className="text-xs text-gray-500">
                  Track dynamic visual asset conditions over time. Add historical photos of high-criticality assets to let the AI calculate degradation velocities, forecast accurate RUL modifications, and plot physical condition trajectories.
                </p>

                {/* Vision Capture Form */}
                <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">Register Vision Captures over Time</div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-4 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Select Target Asset</label>
                      <select 
                        value={visionAssetId} 
                        onChange={(e) => {
                          setVisionAssetId(e.target.value);
                          setDegradationResult(null);
                        }}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-700 font-semibold cursor-pointer"
                      >
                        <option value="">-- Choose Asset --</option>
                        {allAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name} ({asset.roomName})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Capture Date</label>
                      <input 
                        type="date" 
                        value={visionDate} 
                        onChange={(e) => setVisionDate(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Visual Condition</label>
                      <select 
                        value={visionCondition} 
                        onChange={(e) => setVisionCondition(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-600 cursor-pointer"
                      >
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Average">Average</option>
                        <option value="Fair">Fair</option>
                        <option value="Poor">Poor</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Observation Notes</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Mild corrosion starting on bracket." 
                        value={visionNotes} 
                        onChange={(e) => setVisionNotes(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Snapshot Selector */}
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-gray-200/60 pt-3">
                    <div className="flex items-center gap-3">
                      <div className="relative overflow-hidden flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer shadow-sm">
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleVisionFileChange} 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                        />
                        <Camera className="w-4 h-4" />
                        Select asset snapshot
                      </div>
                      {isUploadingVision && (
                        <span className="text-xs text-indigo-500 animate-pulse font-mono">Uploading...</span>
                      )}
                      {visionFileUrl && (
                        <div className="w-10 h-10 border border-gray-200 rounded overflow-hidden">
                          <img src={visionFileUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleAddVisionCapture}
                      disabled={!visionAssetId || !visionFileUrl}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Commit Checkpoint
                    </button>
                  </div>
                </div>

                {/* Analysis & Trajectories Section */}
                {visionAssetId && (
                  <div className="space-y-4 pt-2">
                    {/* Visual Checkpoint History Row */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Visual Checkpoints timeline</div>
                      
                      {/* Checkpoints Timeline */}
                      {!(osState.historicalVisionCaptures || []).some(c => c.assetId === visionAssetId) ? (
                        <div className="py-6 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 text-center text-xs text-gray-400">
                          No historical visual logs recorded yet for selected asset. Add visual checkpoints above!
                        </div>
                      ) : (
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                          {(osState.historicalVisionCaptures || [])
                            .filter(c => c.assetId === visionAssetId)
                            .sort((a, b) => new Date(a.dateCaptured).getTime() - new Date(b.dateCaptured).getTime())
                            .map((cap) => (
                              <div key={cap.id} className="bg-slate-50 border border-gray-155 rounded-xl p-3 min-w-[180px] max-w-[180px] flex flex-col gap-2 shrink-0">
                                <div className="border border-gray-200 rounded-lg overflow-hidden h-24 bg-slate-200">
                                  <img src={cap.dataUrl} alt="Capture" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="font-mono text-[10px] font-bold text-slate-500">{cap.dateCaptured}</span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${
                                      cap.condition === 'Excellent' || cap.condition === 'Good' ? 'bg-emerald-100 text-emerald-800' :
                                      cap.condition === 'Average' ? 'bg-sky-100 text-sky-800' :
                                      cap.condition === 'Fair' ? 'bg-amber-100 text-amber-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {cap.condition}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-gray-600 truncate mt-1 leading-normal italic">&ldquo;{cap.notes}&rdquo;</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* AI Degradation Report & Chart */}
                    {(osState.historicalVisionCaptures || []).some(c => c.assetId === visionAssetId) && (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 border-t border-gray-100 pt-4">
                        {/* Chart Area (5 Cols) */}
                        <div className="md:col-span-5 bg-slate-900 text-slate-100 rounded-xl p-3.5 border border-slate-800 flex flex-col gap-3 min-h-[220px]">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                            Degradation Trajectory
                          </div>
                          
                          {degradationResult ? (
                            <div className="flex-1 min-h-[160px] max-h-[160px] text-slate-100">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                  data={degradationResult.conditionTrend}
                                  margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} />
                                  <YAxis stroke="#94a3b8" fontSize={9} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickFormatter={(val) => {
                                    if (val === 5) return 'Exc';
                                    if (val === 4) return 'Gd';
                                    if (val === 3) return 'Avg';
                                    if (val === 2) return 'Fair';
                                    if (val === 1) return 'Poor';
                                    return '';
                                  }} />
                                  <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                                    labelStyle={{ color: '#94a3b8', fontSize: '10px' }}
                                    itemStyle={{ color: '#e2e8f0', fontSize: '10px' }}
                                  />
                                  <Area type="monotone" dataKey="conditionScore" name="Condition Score" stroke="#6366f1" fillOpacity={0.2} fill="url(#colorScore)" />
                                  <defs>
                                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs text-center p-4">
                              {isAnalyzingDegradation ? (
                                <span className="animate-pulse flex items-center gap-1.5">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  Computing curve...
                                </span>
                              ) : (
                                <button 
                                  onClick={() => runDegradationAnalysis(visionAssetId)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold tracking-wide cursor-pointer font-mono shadow-sm"
                                >
                                  COMPUTE DEGRADATION CURVE
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Text Analysis Area (7 Cols) */}
                        <div className="md:col-span-7 flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Cognitive Degradation Report</span>
                            {degradationResult && (
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                degradationResult.degradationVelocityLabel === 'Negligible' || degradationResult.degradationVelocityLabel === 'Slow & Predictable'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800 animate-pulse'
                              }`}>
                                {degradationResult.degradationVelocityLabel}
                              </span>
                            )}
                          </div>

                          {degradationResult ? (
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 flex flex-col gap-3">
                              <p className="text-[11px] text-gray-700 leading-relaxed font-medium">
                                {degradationResult.analysisText}
                              </p>
                              
                              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                                <div>
                                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Physical Condition Trend</div>
                                  <div className="text-sm font-black text-slate-900 mt-0.5 flex items-center gap-1">
                                    <TrendingDown className="w-4 h-4 text-rose-500" />
                                    Active Wear
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Projected Remaining Useful Life</div>
                                  <div className="text-sm font-black text-indigo-600 mt-0.5 font-mono">
                                    {degradationResult.estimatedRemainingYears} Years RUL
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 py-12 text-center border border-gray-100 rounded-xl bg-gray-50/50">
                              Generate the curve to compute remaining useful life and degradation root cause.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: WORK ORDER HUB & BEYOND-MAINTENANCE JARVIS ANALYTICS */}
            {brainTab === 'workorders' && (
              <div className="flex flex-col gap-5 animate-fade-in text-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    Track corrective maintenance costs and find OPEX leaks. Use Jarvis AI to detect repeated repairs (Rework Loops) on failing assets and recommend structural CAPEX replacements under <b>ISO 55001 Clause 8.1</b>.
                  </p>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={handleSeedDemoWorkOrders}
                      className="px-3 py-1.5 border border-indigo-200 hover:border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      title="Populate test dataset"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Seed Demo WOs
                    </button>
                    
                    <button
                      onClick={runJarvisWorkOrderAudit}
                      disabled={isAnalyzingWO || (osState.workOrders || []).length === 0}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {isAnalyzingWO ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Consulting Jarvis...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                          Run Jarvis Audit
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Jarvis Audit Analysis Report Display */}
                {woAnalysisResult && (
                  <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-5 flex flex-col gap-4 shadow-xl animate-fade-in">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-indigo-400" />
                        <div>
                          <h4 className="text-xs font-black tracking-wider uppercase text-slate-300 font-mono">Jarvis CFO Advisory Terminal</h4>
                          <p className="text-[10px] text-slate-400 font-medium">Strategic Operations Audit & OPEX Recovery Analysis</p>
                        </div>
                      </div>
                      <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider uppercase">
                        ACTIVE ADVISORY
                      </span>
                    </div>

                    {/* Executive Summary */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed font-mono">
                      <p className="whitespace-pre-line">{woAnalysisResult.executiveSummary}</p>
                    </div>

                    {/* KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 flex flex-col gap-1 font-mono">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total spent (OPEX)</span>
                        <span className="text-sm font-black text-slate-200">${(woAnalysisResult.totalMaintenanceSpent || 0).toLocaleString()}</span>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 flex flex-col gap-1 font-mono">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Rework Waste</span>
                        <span className="text-sm font-black text-rose-400">${(woAnalysisResult.reworkCost || 0).toLocaleString()}</span>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 flex flex-col gap-1 font-mono">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Rework Ratio</span>
                        <span className="text-sm font-black text-rose-400">{(woAnalysisResult.reworkPercentage || 0)}%</span>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 flex flex-col gap-1 font-mono">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Est Capex Need</span>
                        <span className="text-sm font-black text-teal-400">${(woAnalysisResult.capexReinvestNeeded || 0).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Rework Detections Grid */}
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Operations Diagnostics & Rework Alerts</div>
                      <div className="grid grid-cols-1 gap-3">
                        {woAnalysisResult.detections.map((det: any, idx: number) => (
                          <div key={det.id || idx} className={`p-4 rounded-xl border font-mono text-xs flex flex-col gap-2.5 ${
                            det.verdict === 'REWORK_LOOP' 
                              ? 'bg-rose-950/20 border-rose-900/40' 
                              : 'bg-slate-950/30 border-slate-800'
                          }`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h5 className="font-extrabold text-slate-200 flex items-center gap-1.5">
                                  {det.assetName}
                                  <span className="text-[10px] text-slate-400 font-normal">({det.roomName})</span>
                                </h5>
                                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">{det.category} &bull; Spent: ${det.moneySpent} ({det.totalTickets} tickets)</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                                det.verdict === 'REWORK_LOOP' 
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {det.verdict === 'REWORK_LOOP' ? 'REWORK LOOP' : 'SUSTAINABLE PM'}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-300 bg-slate-950/50 p-2.5 rounded-lg border border-slate-900 italic">
                              &ldquo;{det.issueDescription}&rdquo;
                            </p>

                            <div className="flex flex-col gap-1">
                              <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400">Jarvis Action Recommendation:</div>
                              <p className="text-[11px] text-slate-200 leading-normal font-sans">{det.recommendation}</p>
                            </div>

                            <div className="text-[10px] text-slate-400 flex items-center gap-1 border-t border-slate-800 pt-2 font-mono">
                              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                              Standard Reference: <span className="text-indigo-300 hover:underline cursor-pointer" onClick={() => onNavigateToClause?.('8.1')}>{det.isoClause}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Year Projections */}
                    {woAnalysisResult.spendByYearProjection && (
                      <div className="space-y-2 border-t border-slate-800 pt-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">5-Year Strategy Spend Projection</div>
                        <div className="grid grid-cols-5 gap-3 text-center">
                          {woAnalysisResult.spendByYearProjection.map((proj: any, idx: number) => (
                            <div key={idx} className="bg-slate-950/50 border border-slate-800 p-2 rounded-xl font-mono">
                              <div className="text-[10px] text-slate-400 font-bold">{proj.year}</div>
                              <div className="text-[10px] text-rose-400 font-medium mt-1">Opex: ${proj.repairOPEX}</div>
                              <div className="text-[10px] text-teal-400 font-medium font-bold">Capex: ${proj.replacementCAPEX}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Form to Log New Ticket */}
                <form onSubmit={handleAddWorkOrder} className="bg-slate-50 border border-gray-200 rounded-2xl p-4 flex flex-col gap-3.5">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">Register Maintenance Log Ticket</div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-3 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Ticket No / Ref</label>
                      <input 
                        type="text" 
                        placeholder="e.g. WO-2026-104" 
                        value={woTicketNo} 
                        onChange={(e) => setWoTicketNo(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-4 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Link to Asset (Inventory)</label>
                      <select 
                        value={woAssetId} 
                        onChange={(e) => {
                          setWoAssetId(e.target.value);
                          if (e.target.value) {
                            const match = allAssets.find(a => a.id === e.target.value);
                            if (match) {
                              setWoAssetName(match.name);
                              setWoRoomName(match.roomName);
                              setWoCategory(match.category);
                            }
                          }
                        }}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-700 font-semibold cursor-pointer"
                      >
                        <option value="">-- Choose Asset (or enter manual below) --</option>
                        {allAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name} ({asset.roomName})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Cost ($ USD)</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 500" 
                        value={woCost} 
                        onChange={(e) => setWoCost(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3 flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Maintenance Type</label>
                      <select 
                        value={woMaintenanceType} 
                        onChange={(e: any) => setWoMaintenanceType(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-700 cursor-pointer"
                      >
                        <option value="Corrective">Corrective (Repair)</option>
                        <option value="Preventive">Preventive (Scheduled)</option>
                        <option value="Emergency">Emergency (Reactive)</option>
                      </select>
                    </div>
                  </div>

                  {!woAssetId && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-2.5 rounded-lg border border-gray-150">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-slate-500">Asset Name (Manual)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Sink drainage line" 
                          value={woAssetName} 
                          onChange={(e) => setWoAssetName(e.target.value)}
                          className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-slate-500">Room Location (Manual)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Main Lobby" 
                          value={woRoomName} 
                          onChange={(e) => setWoRoomName(e.target.value)}
                          className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-slate-500">Asset Category</label>
                        <select 
                          value={woCategory} 
                          onChange={(e) => setWoCategory(e.target.value)}
                          className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:outline-none text-slate-600 cursor-pointer"
                        >
                          <option value="HVAC">HVAC / Mechanical</option>
                          <option value="Plumbing">Plumbing Services</option>
                          <option value="Electrical">Electrical Services</option>
                          <option value="Building Fabric">Building Fabric</option>
                          <option value="Fire & Safety">Fire & Safety</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-slate-600">Work Description / Actions Taken</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Replaced compressor and recharged refrigerant lines." 
                      value={woDescription} 
                      onChange={(e) => setWoDescription(e.target.value)}
                      className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-200/60 pt-3 mt-1">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-slate-500">Date Logged</span>
                        <input 
                          type="date" 
                          value={woDateOpened} 
                          onChange={(e) => setWoDateOpened(e.target.value)}
                          className="bg-white border border-gray-200 rounded p-1 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-slate-500">Current Status</span>
                        <select 
                          value={woStatus} 
                          onChange={(e: any) => setWoStatus(e.target.value)}
                          className="bg-white border border-gray-200 rounded p-1 text-[11px] text-slate-600 cursor-pointer"
                        >
                          <option value="Completed">Completed</option>
                          <option value="Open">Open</option>
                          <option value="In Progress">In Progress</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Commit Log
                    </button>
                  </div>
                </form>

                {/* Work Orders List */}
                <div className="space-y-3">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    Maintenance Ticket Index ({(osState.workOrders || []).length} logs)
                  </div>
                  
                  {(!osState.workOrders || osState.workOrders.length === 0) ? (
                    <div className="py-10 border border-dashed border-gray-200 rounded-2xl bg-gray-50/40 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
                      <Wrench className="w-8 h-8 text-gray-300" />
                      No active maintenance work orders recorded for this site.
                      <p className="text-[10px] text-gray-400">Click "Seed Demo WOs" to load test datasets.</p>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-150 border border-gray-150 rounded-2xl bg-white pr-1">
                      {osState.workOrders.map((wo) => (
                        <div key={wo.id} className="p-3 hover:bg-slate-50/50 flex items-start justify-between gap-3 group transition">
                          <div className="flex gap-3">
                            <div className="mt-1 flex flex-col items-center shrink-0">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${
                                wo.maintenanceType === 'Corrective' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                wo.maintenanceType === 'Emergency' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                                'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}>
                                {wo.maintenanceType.substring(0, 4)}
                              </span>
                              <span className="text-[9px] font-semibold text-gray-400 mt-1 font-mono">{wo.ticketNo}</span>
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-extrabold text-slate-900 leading-none">
                                  {wo.assetName}
                                </h4>
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  {wo.roomName}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-gray-700 leading-normal mt-1.5">{wo.description}</p>
                              <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono mt-1 font-medium">
                                <span>Cost: <b className="text-slate-800">${wo.cost.toLocaleString()}</b></span>
                                <span>&bull;</span>
                                <span>Opened: {wo.dateOpened}</span>
                                <span>&bull;</span>
                                <span className={`font-bold ${wo.status === 'Completed' ? 'text-emerald-600' : 'text-amber-600'}`}>{wo.status}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteWorkOrder(wo.id)}
                            className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-300 opacity-0 group-hover:opacity-100 transition cursor-pointer shrink-0"
                            title="Erase log"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: COGNEE KNOWLEDGE GRAPH VIEW */}
            {brainTab === 'cognee' && (
              <div className="flex flex-col gap-5 animate-fade-in text-slate-800">
                <div className="bg-gradient-to-r from-indigo-50 to-indigo-50/20 border border-indigo-100 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-indigo-950 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-indigo-600 animate-pulse" />
                      Cognee-Inspired Hierarchical Knowledge Graph
                    </h4>
                    <p className="text-xs text-indigo-900/80 max-w-2xl leading-relaxed">
                      This module compiles physical asset registers, work order lifecycles, inspector insights, and unstructured engineering manuals into a queryable Semantic Memory Network. Extract nodes, link systems, and run graph-grounded queries with direct traversal mapping.
                    </p>
                  </div>
                  <button
                    onClick={handleCognify}
                    disabled={isCognifying}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                  >
                    {isCognifying ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Cognifying Site...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Run Cognee Cognify
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                  {/* Left panel: Unstructured ingestion & terminal logs */}
                  <div className="xl:col-span-4 flex flex-col gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 flex flex-col gap-3">
                      <span className="text-xs font-extrabold text-slate-900">Ingest Unstructured Manuals / Site Logs</span>
                      <p className="text-[11px] text-gray-500 leading-normal">
                        Paste unstructured text (vendor catalogs, fire safety rules, custom inspector remarks) to extract new nodes and relations.
                      </p>
                      <textarea
                        value={unstructuredCogneeText}
                        onChange={(e) => setUnstructuredCogneeText(e.target.value)}
                        placeholder="e.g., HVAC maintenance is handled by Technician Davis. Inspector Harold audited rooms and noted system wear in Room 1..."
                        rows={4}
                        className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      />
                    </div>

                    {/* Pipeline terminal */}
                    <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col gap-2 shadow-inner">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          Cognee-Pipeline Terminal
                        </span>
                        <Terminal className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="h-40 overflow-y-auto font-mono text-[10px] text-emerald-400 space-y-1.5 pr-1 scrollbar-thin">
                        {cognifyLogs.length === 0 ? (
                          <div className="text-slate-600 italic">No pipeline tasks currently active. Click 'Run Cognee Cognify' above to compile the site knowledge graph.</div>
                        ) : (
                          cognifyLogs.map((log, lIdx) => (
                            <div key={lIdx} className="leading-normal">
                              <span className="text-slate-500 mr-1.5">&gt;</span>
                              {log}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right panel: Visualization Canvas */}
                  <div className="xl:col-span-8 flex flex-col gap-4">
                    <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 h-[560px] relative overflow-hidden flex flex-col shadow-2xl">
                      {/* Canvas Overlay Header */}
                      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 max-w-[90%]">
                        <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase font-mono tracking-wider">Node Filter:</span>
                          <select
                            value={nodeTypeFilter}
                            onChange={(e) => setNodeTypeFilter(e.target.value)}
                            className="bg-transparent border-none text-[11px] text-white font-bold focus:outline-none cursor-pointer"
                          >
                            <option value="all" className="bg-slate-900">All Entities</option>
                            <option value="Asset" className="bg-slate-900">Asset</option>
                            <option value="Room" className="bg-slate-900">Room</option>
                            <option value="System" className="bg-slate-900">System</option>
                            <option value="WorkOrder" className="bg-slate-900">WorkOrder</option>
                            <option value="Inspector" className="bg-slate-900">Inspector</option>
                            <option value="Concept" className="bg-slate-900">Concept</option>
                          </select>
                        </div>

                        {selectedNodeId && (
                          <button
                            onClick={() => setSelectedNodeId(null)}
                            className="bg-slate-900/90 backdrop-blur border border-slate-800 hover:bg-slate-850 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition flex items-center gap-1"
                          >
                            Reset Selection
                          </button>
                        )}
                      </div>

                      {/* Legend block */}
                      <div className="absolute bottom-4 left-4 z-10 hidden md:flex items-center gap-3 bg-slate-900/95 backdrop-blur border border-slate-800 p-2.5 rounded-xl text-[9px] font-mono font-bold text-slate-300">
                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />Site</div>
                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-teal-500" />Room</div>
                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Asset</div>
                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />System</div>
                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" />WorkOrder</div>
                      </div>

                      {/* SVG Relations Drawing */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        <defs>
                          <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
                          </marker>
                          <marker id="arrow-traversed" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M0,0 L10,5 L0,10 z" fill="#f59e0b" />
                          </marker>
                        </defs>

                        {/* Edges */}
                        {computedGraph.edges
                          .filter(edge => {
                            const sourceNode = computedGraph.nodes.find(n => n.id === edge.source);
                            const targetNode = computedGraph.nodes.find(n => n.id === edge.target);
                            if (!sourceNode || !targetNode) return false;
                            
                            // Check filters
                            if (nodeTypeFilter !== 'all') {
                              if (sourceNode.type !== nodeTypeFilter && targetNode.type !== nodeTypeFilter) return false;
                            }
                            return true;
                          })
                          .map((edge) => {
                            const source = computedGraph.nodes.find(n => n.id === edge.source);
                            const target = computedGraph.nodes.find(n => n.id === edge.target);
                            if (!source || !target) return null;

                            const isTraversed = graphQueryResponse?.traversedEdges?.includes(edge.id) || 
                              (graphQueryResponse?.traversedNodes?.includes(edge.source) && graphQueryResponse?.traversedNodes?.includes(edge.target));

                            return (
                              <g key={edge.id}>
                                <line
                                  x1={source.x}
                                  y1={source.y}
                                  x2={target.x}
                                  y2={target.y}
                                  stroke={isTraversed ? '#eab308' : '#334155'}
                                  strokeWidth={isTraversed ? '2.5' : '1.5'}
                                  strokeDasharray={isTraversed ? '5,5' : 'none'}
                                  markerEnd={isTraversed ? 'url(#arrow-traversed)' : 'url(#arrow)'}
                                  opacity={(selectedNodeId && selectedNodeId !== edge.source && selectedNodeId !== edge.target) ? '0.15' : '0.85'}
                                />
                                {isTraversed && (
                                  <line
                                    x1={source.x}
                                    y1={source.y}
                                    x2={target.x}
                                    y2={target.y}
                                    stroke="#eab308"
                                    strokeWidth="4"
                                    opacity="0.15"
                                    className="blur-sm"
                                  />
                                )}
                              </g>
                            );
                          })}
                      </svg>

                      {/* Interactive HTML Node bubbles */}
                      <div className="absolute inset-0 w-full h-full">
                        {computedGraph.nodes
                          .filter(node => nodeTypeFilter === 'all' || node.type === nodeTypeFilter)
                          .map((node) => {
                            const isSelected = selectedNodeId === node.id;
                            const isTraversed = graphQueryResponse?.traversedNodes?.includes(node.id);
                            
                            // Color coding
                            const colors = 
                              node.type === 'Site' ? 'bg-indigo-600 border-indigo-400 text-indigo-100 shadow-indigo-500/30' :
                              node.type === 'Room' ? 'bg-teal-600 border-teal-400 text-teal-100 shadow-teal-500/30' :
                              node.type === 'Asset' ? 'bg-amber-600 border-amber-400 text-amber-100 shadow-amber-500/30' :
                              node.type === 'System' ? 'bg-emerald-600 border-emerald-400 text-emerald-100 shadow-emerald-500/30' :
                              node.type === 'WorkOrder' ? 'bg-rose-600 border-rose-400 text-rose-100 shadow-rose-500/30' :
                              node.type === 'Inspector' ? 'bg-purple-600 border-purple-400 text-purple-100 shadow-purple-500/30' :
                              'bg-slate-700 border-slate-500 text-slate-100 shadow-slate-500/30';

                            const isDimmed = selectedNodeId && !isSelected;

                            return (
                              <div
                                key={node.id}
                                style={{
                                  position: 'absolute',
                                  left: node.x,
                                  top: node.y,
                                  transform: 'translate(-50%, -50%)',
                                }}
                                onMouseEnter={() => setHoveredNodeId(node.id)}
                                onMouseLeave={() => setHoveredNodeId(null)}
                                onClick={() => setSelectedNodeId(node.id)}
                                className={`cursor-pointer z-20 group rounded-xl px-2.5 py-1.5 border text-[10px] font-extrabold flex items-center gap-1.5 shadow transition-all duration-300 select-none ${colors} ${
                                  isSelected ? 'scale-110 ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-950 border-white z-30' : 
                                  isTraversed ? 'ring-2 ring-yellow-400 scale-105' :
                                  'hover:scale-105'
                                }`}
                                opacity={isDimmed ? '0.4' : '1'}
                              >
                                {isTraversed && (
                                  <span className="absolute -inset-1 rounded-xl border border-yellow-400 animate-ping opacity-60 pointer-events-none" />
                                )}
                                <span className="max-w-[120px] truncate leading-none">{node.label}</span>
                                <span className="opacity-60 text-[8px] font-mono leading-none bg-black/25 px-1 rounded uppercase">
                                  {node.type.substring(0, 3)}
                                </span>
                              </div>
                            );
                          })}
                      </div>

                      {/* Selected Node Inspector Drawer (inside canvas) */}
                      {selectedNodeId && (
                        <div className="absolute right-4 bottom-4 w-72 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-2xl p-4 shadow-2xl z-30 flex flex-col gap-3 animate-slide-up text-white">
                          {(() => {
                            const node = computedGraph.nodes.find(n => n.id === selectedNodeId);
                            if (!node) return null;
                            return (
                              <>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <span className="text-[9px] font-mono font-bold text-slate-400 tracking-widest uppercase bg-slate-800 px-1.5 py-0.5 rounded">
                                      {node.type} node
                                    </span>
                                    <h5 className="text-sm font-extrabold text-white mt-1.5 leading-tight">{node.label}</h5>
                                  </div>
                                  <button
                                    onClick={() => setSelectedNodeId(null)}
                                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    &times;
                                  </button>
                                </div>
                                <p className="text-xs text-slate-300 leading-relaxed font-sans">{node.description || 'No description extracted. Execute Cognify to populate semantics.'}</p>
                                
                                {/* List adjacent relationships */}
                                <div className="border-t border-slate-800 pt-3">
                                  <span className="text-[9px] font-mono text-slate-400 tracking-wider uppercase">Active Connections</span>
                                  <div className="space-y-2 mt-1.5 max-h-32 overflow-y-auto pr-1 text-[10px] font-medium text-slate-300">
                                    {computedGraph.edges
                                      .filter(e => e.source === node.id || e.target === node.id)
                                      .map((e, idx) => {
                                        const otherNodeId = e.source === node.id ? e.target : e.source;
                                        const otherNode = computedGraph.nodes.find(n => n.id === otherNodeId);
                                        return (
                                          <div key={idx} className="flex items-center gap-1.5 bg-slate-850/60 p-1.5 border border-slate-800/40 rounded-lg">
                                            <span className="font-bold text-yellow-400 font-mono tracking-wide">{e.type}</span>
                                            <span className="text-slate-400">{e.source === node.id ? '➡' : '⬅'}</span>
                                            <span className="truncate max-w-[120px] font-bold text-slate-200">{otherNode?.label || otherNodeId}</span>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Karpathy "Delete Everything, Keep Graph" & Domino Cascade Risk Banner */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-xl flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-indigo-500/20 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-300">
                        <Network className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-white tracking-wide">
                            Karpathy Graph Compiler: Multi-Hop Cascade Risk Engine
                          </h4>
                          <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/30 font-mono">
                            Deterministic Fidelity
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Compiles all photos, work orders, and floor zones into a causal network map. Evaluates domino failure paths across connected infrastructure.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-indigo-300 bg-indigo-900/60 px-3 py-1.5 rounded-xl border border-indigo-700/50">
                        <b>{computedGraph.nodes.length}</b> Nodes &bull; <b>{computedGraph.edges.length}</b> Edges
                      </span>
                    </div>
                  </div>

                  {/* Cascade Risk Alerts */}
                  {cascadeRiskResults.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="text-[10px] font-mono uppercase text-indigo-300 tracking-wider flex items-center justify-between">
                        <span>⚠️ Active Multi-Hop Risk Cascades ({cascadeRiskResults.length} systemic threats detected)</span>
                        <span className="text-slate-400">Topology-driven domino analysis</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {cascadeRiskResults.slice(0, 6).map((cascade) => (
                          <div
                            key={cascade.assetId}
                            onClick={() => setSelectedNodeId(`asset-${cascade.assetId}`)}
                            className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/60 hover:border-amber-400/60 rounded-xl p-3 cursor-pointer transition flex flex-col justify-between gap-2 shadow-lg group"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-bold text-white group-hover:text-amber-300 transition truncate">
                                  {cascade.assetName}
                                </span>
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                  cascade.originalRisk === 'Extreme'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}>
                                  Impact Score: {cascade.impactScore}%
                                </span>
                              </div>

                              <p className="text-[11px] text-slate-300 mt-1.5 line-clamp-2">
                                {cascade.criticalWarning || `Potential outage cascade affecting ${cascade.affectedRooms.join(', ') || 'adjacent zones'}.`}
                              </p>
                            </div>

                            <div className="border-t border-slate-800 pt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                              <span>Impacts: <b className="text-slate-200">{cascade.affectedRooms.length} room(s)</b></span>
                              <span className="text-indigo-400 font-bold group-hover:translate-x-0.5 transition flex items-center gap-1">
                                View in Graph ➔
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>No extreme cascade hazards found. All equipment operational dependencies are stabilized.</span>
                    </div>
                  )}
                </div>

                {/* Bottom section: Semantic Graph grounded RAG Search */}
                <div className="bg-white rounded-2xl border border-gray-150 p-6 flex flex-col gap-4 shadow-sm mt-2">
                  <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-yellow-500" />
                    <h4 className="text-sm font-extrabold text-slate-900">Query Graph (Semantic Traversal Search)</h4>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal">
                    Ask questions grounded in the Cognee knowledge graph. The engine will traverse the entities and systems, return answers, and dynamically highlight the path in the live visualizer!
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cogneeSearchQuery}
                      onChange={(e) => setCogneeSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleQueryCognee(); }}
                      placeholder="e.g., Which assets are in Room 1 and what systems do they affect?"
                      className="flex-1 text-xs px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      onClick={handleQueryCognee}
                      disabled={isQueryingGraph || !cogneeSearchQuery.trim()}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {isQueryingGraph ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Traversing...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-yellow-400" />
                          Query Graph
                        </>
                      )}
                    </button>
                  </div>

                  {graphQueryResponse && (
                    <div className="bg-yellow-50/40 border border-yellow-200/50 rounded-2xl p-5 flex flex-col gap-4 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-yellow-200/30 pb-2">
                        <span className="text-[10px] font-black uppercase text-yellow-800 font-mono tracking-wider">Traversed Answer Output</span>
                        <span className="text-[10px] text-yellow-600 font-mono bg-yellow-100/60 px-2 py-0.5 rounded font-bold">Grounded in Graph Store</span>
                      </div>
                      
                      <p className="text-xs text-slate-800 leading-relaxed font-medium">{graphQueryResponse.answer}</p>

                      {/* Display traversed items */}
                      <div className="flex flex-col gap-2 mt-1">
                        <span className="text-[10px] font-mono text-yellow-700 uppercase tracking-widest">Traversed Path Entities</span>
                        <div className="flex flex-wrap gap-1.5">
                          {graphQueryResponse.traversedNodes.map(id => {
                            const node = computedGraph.nodes.find(n => n.id === id);
                            return (
                              <span
                                key={id}
                                onClick={() => setSelectedNodeId(id)}
                                className="cursor-pointer text-[9px] font-bold bg-yellow-100/60 text-yellow-800 px-2 py-1 border border-yellow-200 rounded-lg hover:bg-yellow-200 hover:text-yellow-900 transition flex items-center gap-1"
                              >
                                🔍 {node?.label || id}
                              </span>
                            );
                          })}
                          {graphQueryResponse.traversedNodes.length === 0 && (
                            <span className="text-[10px] italic text-slate-500">No traversed nodes returned.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Strategic Guardrail Rules (Direct prompts override) */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-150 p-6 flex flex-col gap-4">
            <h3 className="text-base font-extrabold text-gray-950 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-500" />
              Strategic Prompt Guardrails (Agent Directives)
            </h3>
            <p className="text-xs text-gray-500">
              Customize or program the specific guidelines your agent must strictly follow. These rules are injected directly into the chatbot’s active priming state as permanent behavioral guardrails.
            </p>

            {/* List of rules */}
            <div className="space-y-2">
              {osState.customRules.map((rule, idx) => (
                <div key={idx} className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 flex items-start justify-between gap-3 group transition hover:bg-amber-50">
                  <div className="flex gap-2.5">
                    <span className="font-mono text-xs font-extrabold text-amber-600 mt-0.5">#{idx + 1}</span>
                    <p className="text-xs text-amber-900 font-medium leading-relaxed">{rule}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(idx)}
                    className="p-1 hover:bg-amber-100 hover:text-red-600 rounded text-amber-400 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="Remove rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Custom Rule */}
            <form onSubmit={handleAddRule} className="flex gap-2 border-t border-gray-100 pt-4 mt-1">
              <input
                type="text"
                placeholder="Program a custom operational directive (e.g., 'Treat aluminum wiring as high alert')..."
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Directive
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: AI Skills & Execution Playground (5 Columns) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Active AI Skills Deck */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-150 p-6 flex flex-col gap-4">
            <h3 className="text-base font-extrabold text-gray-950 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              AI Agent Skills Registry
            </h3>
            <p className="text-xs text-gray-500">
              Toggle specific cognitive skills in and out of the operating system to fit your workflow criteria.
            </p>

            <div className="flex flex-col gap-3">
              {osState.skills.map((skill) => (
                <div 
                  key={skill.id} 
                  className={`border rounded-xl p-3.5 transition flex flex-col gap-2 ${
                    skill.enabled 
                      ? 'bg-gradient-to-r from-indigo-50/50 to-white border-indigo-150' 
                      : 'bg-gray-50/50 border-gray-200 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-extrabold text-xs text-gray-900 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${skill.enabled ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`}></span>
                        {skill.name}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-normal mt-1">{skill.description}</p>
                    </div>
                    
                    {/* IOS-style toggle */}
                    <button
                      onClick={() => handleToggleSkill(skill.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        skill.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          skill.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {skill.enabled && skill.id !== 'vision' && (
                    <button
                      onClick={() => runSkillWorkflow(skill.id)}
                      disabled={isExecuting}
                      className="mt-1 w-full bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200 disabled:text-gray-400 text-white py-1.5 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      EXECUTE COGNITIVE PIPELINE
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active Terminal Workspace */}
          {(isExecuting || terminalLogs.length > 0 || executionResult) && (
            <div className="bg-slate-950 text-slate-200 rounded-2xl shadow-xl p-5 border border-slate-800 font-mono text-xs flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-amber-500 to-emerald-500"></div>
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-400">COGNITIVE ENGINE CONSOLE</span>
                </div>
                {isExecuting && (
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                )}
              </div>

              {/* Console Logs */}
              <div className="max-h-44 overflow-y-auto space-y-1.5 scrollbar-thin text-[11px] leading-relaxed pr-1 text-slate-300">
                {terminalLogs.map((log, i) => (
                  <div key={i} className={log.includes('complete') || log.includes('finished') ? 'text-emerald-400' : ''}>
                    {log}
                  </div>
                ))}
              </div>

              {/* Execution Result Layouts */}
              {executionResult && (
                <div className="border-t border-slate-800 pt-3 flex flex-col gap-3 animate-fade-in text-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 border-b border-slate-800/50 pb-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ANALYSIS GENERATED SUCCESSFULLY
                  </div>

                  {/* 1. COMPLIANCE AUDITOR RESULT */}
                  {executionResult.type === 'compliance' && (
                    <div className="flex flex-col gap-3 font-sans">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">ISO Conformance Score</span>
                        <span className={`text-base font-extrabold font-mono ${
                          executionResult.conformanceScore >= 90 ? 'text-emerald-400' :
                          executionResult.conformanceScore >= 70 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {executionResult.conformanceScore}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            executionResult.conformanceScore >= 90 ? 'bg-emerald-500' :
                            executionResult.conformanceScore >= 70 ? 'bg-amber-500' : 'bg-red-500'
                          }`} 
                          style={{ width: `${executionResult.conformanceScore}%` }}
                        ></div>
                      </div>

                      <div className="space-y-2 mt-1">
                        {executionResult.issues.map((issue: any, index: number) => (
                          <div key={index} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <button
                                onClick={() => onNavigateToClause?.(issue.id)}
                                className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 text-left cursor-pointer"
                                title="Click to view standard details in the Notebook"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                {issue.title}
                              </button>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                issue.severity === 'High' ? 'bg-red-950 text-red-400 border border-red-900' :
                                issue.severity === 'Medium' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                                'bg-emerald-950 text-emerald-400 border border-emerald-900'
                              }`}>
                                {issue.severity}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-normal">{issue.description}</p>
                            {issue.assets.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {issue.assets.map((asset: string, ai: number) => (
                                  <span key={ai} className="text-[9px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                    {asset}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. ADVANCED AI CFO & STRATEGIC CAPITAL MONITOR DASHBOARD */}
                  {executionResult.type === 'finance' && (
                    <div className="flex flex-col gap-5 font-sans text-slate-100 max-w-full">
                      
                      {/* Executive Header */}
                      <div className="border-b border-slate-800 pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Landmark className="w-5 h-5 text-indigo-400" />
                            <h4 className="text-sm font-extrabold tracking-tight uppercase text-indigo-300">AI CFO Corporate Ledger</h4>
                          </div>
                          <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-900 px-2.5 py-0.5 rounded-full font-bold">
                            Active Portfolio Oversight
                          </span>
                        </div>
                      </div>

                      {/* CFO Executive Memo / Advisory */}
                      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs flex flex-col gap-2.5 leading-relaxed">
                        <div className="grid grid-cols-2 gap-4 border-b border-slate-800 pb-2 text-[10px] font-mono text-slate-400">
                          <div>
                            <span className="block font-bold">TO: Facility Board of Directors</span>
                            <span className="block mt-0.5">DATE: {new Date().toLocaleDateString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="block font-bold">FROM: AI CFO Cognitive Agent</span>
                            <span className="block mt-0.5">VERSION: Active 24/7 Monitor</span>
                          </div>
                        </div>
                        <p className="whitespace-pre-line text-slate-300 font-medium leading-relaxed">
                          {executionResult.executiveSummary}
                        </p>
                      </div>

                      {/* Capital KPI Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between gap-4">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-mono block">Capital Value</span>
                            <span className="text-sm font-extrabold text-slate-100 font-mono mt-0.5 block">${(executionResult.totalAssetValue || 0).toLocaleString()}</span>
                          </div>
                          <Coins className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between gap-4">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-mono block">Concentrated Risk</span>
                            <span className="text-sm font-extrabold text-rose-400 font-mono mt-0.5 block">{executionResult.riskConcentrationPercentage || 0}%</span>
                          </div>
                          <Percent className="w-5 h-5 text-rose-400" />
                        </div>
                        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between gap-4">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-mono block">Strategic Reserve</span>
                            <span className="text-sm font-extrabold text-emerald-400 font-mono mt-0.5 block">${(executionResult.monthlyAllocation || 0).toLocaleString()}/mo</span>
                          </div>
                          <TrendingUp className="w-5 h-5 text-emerald-400" />
                        </div>
                      </div>

                      {/* CFO Action Alerts Panel */}
                      {executionResult.alerts && executionResult.alerts.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold">CFO Active Alerts & Triggers</span>
                          <div className="flex flex-col gap-2">
                            {executionResult.alerts.map((alert: any) => (
                              <div 
                                key={alert.id} 
                                className={`border rounded-xl p-3 flex gap-3 text-xs ${
                                  alert.type === 'critical' ? 'bg-red-950/35 border-red-900/50 text-red-200' :
                                  alert.type === 'warning' ? 'bg-amber-950/35 border-amber-900/50 text-amber-200' :
                                  'bg-sky-950/35 border-sky-900/50 text-sky-200'
                                }`}
                              >
                                <div className="mt-0.5">
                                  {alert.type === 'critical' ? (
                                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                                  ) : alert.type === 'warning' ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                  ) : (
                                    <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                                  )}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-extrabold block text-slate-100">{alert.title}</span>
                                  <span className="leading-relaxed opacity-90">{alert.message}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Multi-Scenario Spend Curve (Recharts) */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold block">Capital Spend Forecasting Sandbox</span>
                          <span className="text-[10px] text-slate-500 mt-0.5 block">Simulating cash outflow models under diverse wear stress and economic climates.</span>
                        </div>
                        <div className="h-44 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={executionResult.scenarios || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorBase" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorInflation" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="year" stroke="#94a3b8" fontSize={9} />
                              <YAxis stroke="#94a3b8" fontSize={9} tickFormatter={(v) => `$${Math.round(v/1000)}k`} />
                              <RechartsTooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                                itemStyle={{ fontSize: '11px', color: '#f1f5f9' }}
                                formatter={(value: any) => [`$${Math.round(Number(value)).toLocaleString()}`, '']}
                              />
                              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} />
                              <Area name="Base CAPEX Spend" type="monotone" dataKey="baseAmount" stroke="#6366f1" strokeWidth={1.5} fillOpacity={1} fill="url(#colorBase)" />
                              <Area name="High Wear Stress Model" type="monotone" dataKey="stressAmount" stroke="#f43f5e" strokeWidth={1.5} fillOpacity={1} fill="url(#colorStress)" />
                              <Area name="Inflation Adjusted" type="monotone" dataKey="inflationAmount" stroke="#eab308" strokeWidth={1.5} fillOpacity={1} fill="url(#colorInflation)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Exposure/Criticality Ranking */}
                      {executionResult.criticalAssets && executionResult.criticalAssets.length > 0 && (
                        <div className="flex flex-col gap-2.5">
                          <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold">Capital Asset Risk Rankings</span>
                          <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden text-xs">
                            {executionResult.criticalAssets.map((asset: any, index: number) => (
                              <div key={asset.assetId} className="p-3 hover:bg-slate-850/40 transition flex items-center justify-between gap-4">
                                <div className="flex gap-2.5 items-start">
                                  <span className="font-mono text-xs font-bold text-slate-500 mt-0.5">#{index + 1}</span>
                                  <div>
                                    <span className="font-extrabold text-slate-200 block">{asset.assetName}</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5 block">{asset.roomName}</span>
                                  </div>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                  <div>
                                    <span className="font-mono font-bold text-slate-100 block">${(asset.cost || 0).toLocaleString()}</span>
                                    <span className={`text-[9px] font-bold uppercase tracking-wider block mt-0.5 ${
                                      asset.riskRating === 'Extreme' ? 'text-red-400' :
                                      asset.riskRating === 'High' ? 'text-orange-400' :
                                      'text-amber-400'
                                    }`}>
                                      {asset.riskRating} Risk
                                    </span>
                                  </div>
                                  <div className="bg-slate-850 border border-slate-750 px-2 py-1 rounded text-center min-w-[50px] font-mono">
                                    <span className="text-[8px] text-slate-400 uppercase font-semibold block leading-none">Exposure</span>
                                    <span className="text-xs font-extrabold text-indigo-300 mt-0.5 block leading-none">{Math.round(asset.score)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {/* 3. RISK VECTORS RESULT */}
                  {executionResult.type === 'risk' && (
                    <div className="flex flex-col gap-3 font-sans">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Urgent Remedial Interventions</span>
                        <span className="font-extrabold font-mono text-red-400">{executionResult.severityCount} critical flags</span>
                      </div>

                      <div className="space-y-2 mt-1">
                        {executionResult.mitigations.map((item: any, idx: number) => (
                          <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-slate-200">{item.assetName}</span>
                              <span className={`text-[9px] font-bold px-1 rounded uppercase ${
                                item.rating === 'Extreme' ? 'bg-red-950 text-red-400 border border-red-900' :
                                item.rating === 'High' ? 'bg-orange-950 text-orange-400 border border-orange-900' :
                                'bg-yellow-950 text-yellow-400 border border-yellow-900'
                              }`}>
                                {item.rating} Risk
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-normal mt-1 italic">
                              💡 Action Plan: {item.mitigation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setExecutionResult(null);
                      setTerminalLogs([]);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 py-1.5 rounded-lg text-[10px] font-mono cursor-pointer transition text-center"
                  >
                    CLOSE RESULTS CONSOLE
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
