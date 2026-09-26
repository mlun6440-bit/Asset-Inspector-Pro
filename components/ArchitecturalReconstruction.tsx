import React, { useState, useRef, useEffect } from 'react';
import { SiteInfo, Room, WallSegment, GridAssetPlacement, ReconstructionData } from '../types';
import { reconstructLayoutFromImage } from '../services/geminiService';

interface ArchitecturalReconstructionProps {
  siteInfo: SiteInfo;
  rooms: Room[];
  onUpdateSiteInfo: (key: keyof SiteInfo, value: any) => void;
  onSave: () => void;
  hasEditLock: boolean;
}

// Sample image templates in case they don't upload their own
const SAMPLE_TEMPLATES = [
  {
    name: 'Sample 1: Standard Office Suite',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80', // visual placeholder
    desc: 'An L-shaped room with structural columns and double doors.'
  },
  {
    name: 'Sample 2: Mechanical Plantroom',
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    desc: 'Rectangular layout with fire protection manifolds and entry lobbies.'
  }
];

export const ArchitecturalReconstruction: React.FC<ArchitecturalReconstructionProps> = ({
  siteInfo,
  rooms,
  onUpdateSiteInfo,
  onSave,
  hasEditLock
}) => {
  // Extract initial data or set default empty slate
  const defaultReconstruction: ReconstructionData = siteInfo.reconstructionData || {
    gridScale: 40, // 40px per meter (so a 20x20 grid is 800px)
    walls: [
      // Draw outer boundary walls by default
      { id: 'boundary-1', x1: 2, y1: 2, x2: 18, y2: 2, type: 'wall' },
      { id: 'boundary-2', x1: 18, y1: 2, x2: 18, y2: 18, type: 'wall' },
      { id: 'boundary-3', x1: 18, y1: 18, x2: 2, y2: 18, type: 'wall' },
      { id: 'boundary-4', x1: 2, y1: 18, x2: 2, y2: 2, type: 'wall' },
      { id: 'boundary-door', x1: 8, y1: 18, x2: 12, y2: 18, type: 'door' },
    ],
    assets: [],
    gridWidth: 20,
    gridHeight: 20,
    slices: [
      { id: 'v-1', name: 'West Wall Align', position: 15, direction: 'vertical' },
      { id: 'v-2', name: 'East Wall Align', position: 85, direction: 'vertical' },
      { id: 'h-1', name: 'North Boundary', position: 15, direction: 'horizontal' },
      { id: 'h-2', name: 'South Boundary', position: 85, direction: 'horizontal' }
    ],
    uploadedLayoutImage: ''
  };

  const [recon, setRecon] = useState<ReconstructionData>(defaultReconstruction);
  const [activeTab, setActiveTab] = useState<'limitations' | 'slicing' | 'grid'>('grid');
  
  // Slicing local states
  const [dragSliceId, setDragSliceId] = useState<string | null>(null);
  const [sliceDirection, setSliceDirection] = useState<'vertical' | 'horizontal'>('vertical');
  const [sliceNameInput, setSliceNameInput] = useState('');
  
  // Grid Canvas Drawing state
  const [drawMode, setDrawMode] = useState<'wall' | 'window' | 'door' | 'asset' | 'select'>('select');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [hoverGridPos, setHoverGridPos] = useState<{ x: number; y: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Select an action or draw tool to begin engineering.');
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const reconFileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize state when siteInfo loads
  useEffect(() => {
    if (siteInfo.reconstructionData) {
      setRecon(siteInfo.reconstructionData);
    }
  }, [siteInfo.reconstructionData]);

  // Save changes back to parent
  const updateAndSaveRecon = (updated: ReconstructionData) => {
    setRecon(updated);
    onUpdateSiteInfo('reconstructionData', updated);
  };

  // Helper: Find all assets across all rooms to let them map to the grid
  const allDetectedAssets = rooms.flatMap(r => 
    (r.assets || []).map(a => ({
      ...a,
      roomName: r.roomName
    }))
  );

  // Handle Drag & Drop / Upload of image
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const updated = { ...recon, uploadedLayoutImage: base64 };
      updateAndSaveRecon(updated);
      setStatusMessage('Layout image uploaded successfully! Configure your adaptive slices next.');
    };
    reader.readAsDataURL(file);
  };

  // Run Slicing Analysis with Gemini API!
  const runGeminiAnalysis = async () => {
    if (!recon.uploadedLayoutImage) {
      setStatusMessage('⚠️ Please upload a layout drawing or site photo first.');
      return;
    }

    setAnalyzingImage(true);
    setStatusMessage('🧠 AI is executing Adaptive Slicing and visual wall projection analyses...');
    try {
      const detectedSegments = await reconstructLayoutFromImage(recon.uploadedLayoutImage, recon.slices);
      if (detectedSegments && detectedSegments.length > 0) {
        // Retain existing assets, but replace walls with AI projections
        const updated = {
          ...recon,
          walls: detectedSegments
        };
        updateAndSaveRecon(updated);
        setStatusMessage(`✅ AI successfully drafted ${detectedSegments.length} wall/boundary segments onto the grid!`);
        setActiveTab('grid');
      } else {
        setStatusMessage('⚠️ AI could not confidently identify boundaries. Grid initialized with standard shell.');
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('❌ AI Analysis failed. Please check your internet connection or try another image.');
    } finally {
      setAnalyzingImage(false);
    }
  };

  // Reset to default outer bounds
  const resetLayout = () => {
    if (!confirm('Are you sure you want to reset the current schematic layout? All customized walls will be cleared.')) return;
    updateAndSaveRecon({
      ...recon,
      walls: [
        { id: 'boundary-1', x1: 2, y1: 2, x2: 18, y2: 2, type: 'wall' },
        { id: 'boundary-2', x1: 18, y1: 2, x2: 18, y2: 18, type: 'wall' },
        { id: 'boundary-3', x1: 18, y1: 18, x2: 2, y2: 18, type: 'wall' },
        { id: 'boundary-4', x1: 2, y1: 18, x2: 2, y2: 2, type: 'wall' },
        { id: 'boundary-door', x1: 8, y1: 18, x2: 12, y2: 18, type: 'door' },
      ],
      assets: []
    });
    setStatusMessage('Layout reset to initial boundary container.');
  };

  // Add a slice marker manually
  const addSliceMarker = () => {
    if (!sliceNameInput.trim()) {
      alert('Please enter a name for the slice descriptor.');
      return;
    }
    const newSlice = {
      id: `slice-${Date.now()}`,
      name: sliceNameInput.trim(),
      position: 50,
      direction: sliceDirection
    };
    updateAndSaveRecon({
      ...recon,
      slices: [...recon.slices, newSlice]
    });
    setSliceNameInput('');
    setStatusMessage(`Added ${sliceDirection} slice: "${newSlice.name}"`);
  };

  // Delete a slice marker
  const deleteSliceMarker = (id: string) => {
    updateAndSaveRecon({
      ...recon,
      slices: recon.slices.filter(s => s.id !== id)
    });
  };

  // Coordinate math helpers for interactive SVG grid
  const gridSpacing = 20; // width of a single 0.5 coordinate square in pixels
  const maxCoordinate = 20;
  const canvasPixelSize = maxCoordinate * gridSpacing; // 400px x 400px

  const getCoordinatesFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPixel = e.clientX - rect.left;
    const yPixel = e.clientY - rect.top;

    // Convert to 0-20 grid units with 0.5 (half-unit) snapping accuracy
    let xCoord = xPixel / gridSpacing;
    let yCoord = yPixel / gridSpacing;

    // Snap to nearest 0.5
    xCoord = Math.round(xCoord * 2) / 2;
    yCoord = Math.round(yCoord * 2) / 2;

    // Clamp inside grid space
    xCoord = Math.max(0, Math.min(maxCoordinate, xCoord));
    yCoord = Math.max(0, Math.min(maxCoordinate, yCoord));

    return { x: xCoord, y: yCoord };
  };

  // Grid interactive events
  const handleGridMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!hasEditLock) return;
    const coords = getCoordinatesFromEvent(e);

    if (drawMode === 'wall' || drawMode === 'window' || drawMode === 'door') {
      setDragStart(coords);
      setStatusMessage(`Drawing ${drawMode}: Start coordinate (${coords.x}, ${coords.y}). Drag to end point and release.`);
    } else if (drawMode === 'asset') {
      if (!selectedAssetId) {
        setStatusMessage('⚠️ Select an asset from the list first to place it.');
        return;
      }
      const assetObj = allDetectedAssets.find(a => a.id === selectedAssetId);
      if (!assetObj) return;

      // Check if already placed, if so reposition, otherwise add new
      const existingIdx = recon.assets.findIndex(p => p.assetId === selectedAssetId);
      const updatedPlacements = [...recon.assets];
      
      const newPlacement: GridAssetPlacement = {
        assetId: assetObj.id,
        assetName: assetObj.description,
        category: assetObj.category,
        x: coords.x,
        y: coords.y
      };

      if (existingIdx >= 0) {
        updatedPlacements[existingIdx] = newPlacement;
      } else {
        updatedPlacements.push(newPlacement);
      }

      updateAndSaveRecon({
        ...recon,
        assets: updatedPlacements
      });
      setStatusMessage(`Mapped asset "${assetObj.description}" to coordinate (${coords.x}, ${coords.y}).`);
    }
  };

  const handleGridMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getCoordinatesFromEvent(e);
    setHoverGridPos(coords);
  };

  const handleGridMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragStart) return;
    const dragEnd = getCoordinatesFromEvent(e);

    // Prevent zero-length lines
    if (dragStart.x === dragEnd.x && dragStart.y === dragEnd.y) {
      setDragStart(null);
      return;
    }

    // Add new wall segment
    const newSegment: WallSegment = {
      id: `seg-${Date.now()}`,
      x1: dragStart.x,
      y1: dragStart.y,
      x2: dragEnd.x,
      y2: dragEnd.y,
      type: drawMode as 'wall' | 'window' | 'door'
    };

    updateAndSaveRecon({
      ...recon,
      walls: [...recon.walls, newSegment]
    });

    setStatusMessage(`Completed ${drawMode}: Line from (${dragStart.x}, ${dragStart.y}) to (${dragEnd.x}, ${dragEnd.y}).`);
    setDragStart(null);
  };

  // Delete a wall segment
  const deleteWallSegment = (id: string) => {
    updateAndSaveRecon({
      ...recon,
      walls: recon.walls.filter(w => w.id !== id)
    });
    setStatusMessage('Deleted segment.');
  };

  // Delete placed asset
  const deletePlacedAsset = (assetId: string) => {
    updateAndSaveRecon({
      ...recon,
      assets: recon.assets.filter(a => a.assetId !== assetId)
    });
    setStatusMessage('Removed asset placement.');
  };

  // Load sample template for quick testing
  const loadSampleLayout = (url: string) => {
    updateAndSaveRecon({
      ...recon,
      uploadedLayoutImage: url,
      walls: [
        { id: 'boundary-1', x1: 1, y1: 1, x2: 19, y2: 1, type: 'wall' },
        { id: 'boundary-2', x1: 19, y1: 1, x2: 19, y2: 19, type: 'wall' },
        { id: 'boundary-3', x1: 19, y1: 19, x2: 1, y2: 19, type: 'wall' },
        { id: 'boundary-4', x1: 1, y1: 19, x2: 1, y2: 1, type: 'wall' },
        { id: 'lobby-wall-1', x1: 1, y1: 7, x2: 8, y2: 7, type: 'wall' },
        { id: 'lobby-wall-2', x1: 8, y1: 7, x2: 8, y2: 19, type: 'wall' },
        { id: 'window-north-1', x1: 4, y1: 1, x2: 8, y2: 1, type: 'window' },
        { id: 'window-north-2', x1: 12, y1: 1, x2: 16, y2: 1, type: 'window' },
        { id: 'door-lobby', x1: 8, y1: 11, x2: 8, y2: 14, type: 'door' },
      ]
    });
    setStatusMessage('Sample layout drawing template loaded! You can modify or run AI analyses.');
  };

  // Export Reconstructed Layout to highly clean, standalone SVG file
  const exportToSVGFile = () => {
    const svgHeader = `<?xml version="1.0" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="800" height="800" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" version="1.1">`;
    const svgGrid = `<rect width="400" height="400" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>`;
    
    // Draw walls
    const svgWalls = recon.walls.map(w => {
      let stroke = '#1e293b';
      let strokeWidth = '3';
      let strokeDash = '';
      if (w.type === 'window') {
        stroke = '#0ea5e9';
        strokeWidth = '4';
      } else if (w.type === 'door') {
        stroke = '#e11d48';
        strokeWidth = '2';
        strokeDash = 'stroke-dasharray="3,3"';
      }
      return `<line x1="${w.x1 * gridSpacing}" y1="${w.y1 * gridSpacing}" x2="${w.x2 * gridSpacing}" y2="${w.y2 * gridSpacing}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
    }).join('\n');

    const escapeXml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Draw assets
    const svgAssets = recon.assets.map(a => {
      const px = a.x * gridSpacing;
      const py = a.y * gridSpacing;
      return `<g>
        <circle cx="${px}" cy="${py}" r="8" fill="#4f46e5" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${px}" y="${py + 3}" font-family="sans-serif" font-size="7" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(a.category.charAt(0))}</text>
        <text x="${px}" y="${py - 12}" font-family="sans-serif" font-size="6" font-weight="bold" fill="#1e293b" text-anchor="middle">${escapeXml(a.assetName)}</text>
      </g>`;
    }).join('\n');

    const svgFooter = `\n</svg>`;
    const fullSvgContent = `${svgHeader}\n${svgGrid}\n${svgWalls}\n${svgAssets}${svgFooter}`;

    const blob = new Blob([fullSvgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${siteInfo.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_floorplan.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage('Successfully exported professional Floorplan SVG drawing!');
  };

  return (
    <div id="architectural-reconstruction" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl flex flex-col gap-6">
      
      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-indigo-400">
            <span className="material-icons">grid_on</span>
            Architectural Reconstruction Engine
          </h2>
          <p className="text-xs text-slate-400">Stage 1: Adaptive Slicing, Spatial Projection & Coordinate Grid Engineering</p>
        </div>
        <div className="flex gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab('limitations')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 ${activeTab === 'limitations' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <span className="material-icons text-sm">psychology</span> Technical Critique & Limits
          </button>
          <button 
            onClick={() => setActiveTab('slicing')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 ${activeTab === 'slicing' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <span className="material-icons text-sm">unfold_more</span> Adaptive Slicing
          </button>
          <button 
            onClick={() => setActiveTab('grid')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 ${activeTab === 'grid' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <span className="material-icons text-sm">architecture</span> Floorplan Grid Canvas
          </button>
        </div>
      </div>

      {/* VIEW 1: LIMITATIONS CRITIQUE & ACCURACY ROADMAP */}
      {activeTab === 'limitations' && (
        <div className="space-y-6 animate-fade-in max-w-4xl">
          <div className="bg-amber-950/30 border border-amber-900/50 p-5 rounded-2xl flex gap-4">
            <span className="material-icons text-amber-500 text-2xl shrink-0">report_problem</span>
            <div>
              <h3 className="text-amber-400 font-bold mb-1">Reality vs. Vision: The Hard Physical Limits</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Recreating architectural line drawings (CAD/BIM) from photographic capture or client-uploaded sketches is a highly useful approximation tool. However, to maintain absolute compliance with professional standards, facility inspectors must understand that vision algorithms cannot replace physical site surveyor tools.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                <span className="material-icons text-red-400 text-sm">block</span> Inherent Physical Blindspots
              </h4>
              <ul className="text-xs text-slate-400 space-y-3 list-disc pl-4 leading-relaxed">
                <li>
                  <strong className="text-slate-300">Perspective Skew & Parallax:</strong> Wide-angle camera lenses introduce barrel distortion. Walls that appear flat physically are visual arcs on camera, skewing calculated measurements by up to 15%.
                </li>
                <li>
                  <strong className="text-slate-300">Occlusion & Furniture Blocks:</strong> Stationary equipment, cabinets, and structural pillars hide corners, leading to incomplete visual layouts.
                </li>
                <li>
                  <strong className="text-slate-300">Structural Thickness Anonymity:</strong> Camera views cannot resolve wall thickness (e.g., 90mm timber stud vs. 200mm double masonry), nor can they detect plumbing, conduits, and insulation.
                </li>
                <li>
                  <strong className="text-slate-300">Lack of Absolute Scale Referents:</strong> Without a physical calibration target (such as a 1m checkerboard) or structured laser points, algorithms can only guess room size based on standard doors or typical floorboards.
                </li>
              </ul>
            </div>

            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                <span className="material-icons text-green-400 text-sm">verified</span> Mitigation & Grid Calibration Rules
              </h4>
              <ul className="text-xs text-slate-400 space-y-3 list-disc pl-4 leading-relaxed">
                <li>
                  <strong className="text-slate-300">Adaptive Slicing markers:</strong> We partition the space visually into projection slices. Slices map coordinate planes to physical structures (e.g., establishing a 5-meter span between column centers).
                </li>
                <li>
                  <strong className="text-slate-300">Asset Integration:</strong> Linking real assets detected during assessment (such as HVAC and Exit Lights) directly to the coordinate grid anchors the relative spatial model.
                </li>
                <li>
                  <strong className="text-slate-300">Calibration Anchors:</strong> Always establish one known dimension first (e.g. standard entrance width = 0.9m) to automatically calibrate the scale multiplier.
                </li>
                <li>
                  <strong className="text-slate-300">Iterative Manual Review:</strong> Run Gemini AI to build the first draft schematic, then use our interactive grid click-and-drag drawing controls to refine, close open wall loops, and correct layout errors.
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
            <button onClick={() => setActiveTab('slicing')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs transition">
              PROCEED TO STAGE 1: VISUAL SLICING
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: ADAPTIVE SLICING MODULE */}
      {activeTab === 'slicing' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid md:grid-cols-12 gap-6">
            
            {/* Left Column: Slices Configuration */}
            <div className="md:col-span-5 bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div>
                <h3 className="font-bold text-sm text-slate-200">Adaptive Slice Markers</h3>
                <p className="text-xs text-slate-400">Add vertical or horizontal grid dividers to capture partition planes on the sketch/photo.</p>
              </div>

              {/* Add Slice Form */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setSliceDirection('vertical')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${sliceDirection === 'vertical' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400'}`}
                  >
                    <span className="material-icons text-sm">unfold_more</span> Vertical (X)
                  </button>
                  <button 
                    onClick={() => setSliceDirection('horizontal')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${sliceDirection === 'horizontal' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400'}`}
                  >
                    <span className="material-icons text-sm">unfold_less</span> Horizontal (Y)
                  </button>
                </div>
                
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Slice Description / Marker Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g., East Partition Wall, Lobby Gate"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-600"
                    value={sliceNameInput}
                    onChange={(e) => setSliceNameInput(e.target.value)}
                  />
                </div>

                <button 
                  onClick={addSliceMarker}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-1"
                >
                  <span className="material-icons text-sm">add</span> Add Slice Divider
                </button>
              </div>

              {/* Slices list */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Slice Coordinates</h4>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {recon.slices.map((s) => (
                    <div key={s.id} className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200">{s.name}</span>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="px-1 bg-slate-850 rounded text-slate-400 font-mono">
                            {s.direction === 'vertical' ? 'V-Slice (X)' : 'H-Slice (Y)'}
                          </span>
                          <span>Position: {s.position}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={s.position} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateAndSaveRecon({
                              ...recon,
                              slices: recon.slices.map(item => item.id === s.id ? { ...item, position: val } : item)
                            });
                          }}
                          className="w-16 accent-indigo-500 cursor-pointer h-1 rounded"
                        />
                        <button 
                          onClick={() => deleteSliceMarker(s.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <span className="material-icons text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {recon.slices.length === 0 && (
                    <p className="text-[10px] text-slate-500 text-center italic py-2">No slice boundaries defined.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Slicing Sandbox */}
            <div className="md:col-span-7 bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-200">Site Capture / Drawing Slicing Canvas</h3>
                <p className="text-xs text-slate-400 mb-4">Upload a site photo or architectural sketch, and position visual slice barriers over structural anchors.</p>
                
                {/* Visual Sandbox containing uploaded image overlayed with slices */}
                <div className="relative border border-slate-800 rounded-xl bg-slate-900 overflow-hidden w-full h-80 flex items-center justify-center">
                  
                  {recon.uploadedLayoutImage ? (
                    <>
                      <img 
                        src={recon.uploadedLayoutImage} 
                        alt="Uploaded site draft" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain opacity-60"
                      />
                      
                      {/* Render Visual Slices Over Drawing */}
                      {recon.slices.map((s) => {
                        const isVertical = s.direction === 'vertical';
                        return (
                          <div
                            key={s.id}
                            className="absolute pointer-events-none flex items-center justify-center"
                            style={{
                              left: isVertical ? `${s.position}%` : '0',
                              top: isVertical ? '0' : `${s.position}%`,
                              width: isVertical ? '2px' : '100%',
                              height: isVertical ? '100%' : '2px',
                              backgroundColor: isVertical ? '#4f46e5' : '#0ea5e9',
                              boxShadow: '0 0 8px rgba(79, 70, 229, 0.6)'
                            }}
                          >
                            <span className="absolute px-1.5 py-0.5 rounded text-[8px] font-bold text-white bg-slate-950/90 whitespace-nowrap border border-slate-800"
                                  style={{
                                    transform: isVertical ? 'rotate(90deg) translateY(-14px)' : 'translateY(-14px)'
                                  }}>
                              {s.name} ({s.position}%)
                            </span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 p-6 text-center">
                      <span className="material-icons text-slate-700 text-5xl">cloud_upload</span>
                      <p className="text-xs text-slate-500">No layout visual found. Upload a photo/sketch or pick a template:</p>
                      
                      <div className="flex flex-wrap gap-2 justify-center mt-2">
                        {SAMPLE_TEMPLATES.map((tpl, i) => (
                          <button 
                            key={i}
                            onClick={() => loadSampleLayout(tpl.url)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium py-1 px-2.5 rounded-lg border border-slate-700"
                          >
                            {tpl.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => reconFileInputRef.current?.click()}
                    className="relative overflow-hidden bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold py-2.5 px-4 rounded-xl text-xs cursor-pointer flex items-center gap-1.5 w-full sm:w-auto text-center justify-center"
                  >
                    <span className="material-icons text-sm pointer-events-none">photo_camera</span>
                    Upload Photo or Drawing Sketch
                  </button>
                  <input 
                    type="file" 
                    ref={reconFileInputRef}
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                  />

                  {recon.uploadedLayoutImage && (
                    <button 
                      onClick={() => updateAndSaveRecon({ ...recon, uploadedLayoutImage: '' })}
                      className="text-red-400 hover:text-red-300 text-xs font-bold"
                    >
                      Clear Image
                    </button>
                  )}
                </div>
              </div>

              {/* Call Gemini API Button */}
              <div className="border-t border-slate-800 pt-4 mt-4 flex items-center justify-between">
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="material-icons text-xs text-indigo-400">info</span>
                  Uses gemini-3.5-flash model
                </div>
                
                <button 
                  onClick={runGeminiAnalysis}
                  disabled={analyzingImage || !recon.uploadedLayoutImage}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl text-xs transition flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyzingImage ? (
                    <>
                      <span className="material-icons animate-spin text-sm">sync</span>
                      Analyzing Layout with AI...
                    </>
                  ) : (
                    <>
                      <span className="material-icons text-sm">auto_awesome</span>
                      Analyze Slices with Gemini AI
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* VIEW 3: FLOORPLAN GRID CANVAS */}
      {activeTab === 'grid' && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="grid lg:grid-cols-12 gap-6">
            
            {/* Control Column */}
            <div className="lg:col-span-4 bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-5 flex flex-col justify-between">
              <div className="space-y-5">
                <div>
                  <h3 className="font-bold text-sm text-slate-200">Grid Controls & Palette</h3>
                  <p className="text-xs text-slate-400">Snaps to 0.5-unit increments representing physical half-meter segments.</p>
                </div>

                {/* Drawing Mode buttons */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select Tool Mode</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setDrawMode('select')}
                      className={`p-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${drawMode === 'select' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      <span className="material-icons text-sm">near_me</span> Select / Inspect
                    </button>
                    <button 
                      onClick={() => setDrawMode('wall')}
                      className={`p-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${drawMode === 'wall' ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      <span className="material-icons text-sm">edit</span> Draw Wall
                    </button>
                    <button 
                      onClick={() => setDrawMode('window')}
                      className={`p-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${drawMode === 'window' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      <span className="material-icons text-sm">space_dashboard</span> Draw Window
                    </button>
                    <button 
                      onClick={() => setDrawMode('door')}
                      className={`p-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${drawMode === 'door' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      <span className="material-icons text-sm">sensor_door</span> Draw Door
                    </button>
                  </div>
                </div>

                {/* Asset Mapping Sidebar selector */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                    <span>Place Detected Asset</span>
                    <span className="bg-indigo-900 text-indigo-300 text-[8px] px-1.5 py-0.5 rounded font-mono font-bold uppercase">{allDetectedAssets.length} total</span>
                  </h4>
                  
                  <div className="space-y-1.5">
                    <select
                      value={selectedAssetId}
                      onChange={(e) => {
                        setSelectedAssetId(e.target.value);
                        setDrawMode('asset');
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200"
                    >
                      <option value="">-- Choose Asset from Assessment --</option>
                      {allDetectedAssets.map((asset) => {
                        const isPlaced = recon.assets.some(p => p.assetId === asset.id);
                        return (
                          <option key={asset.id} value={asset.id}>
                            {isPlaced ? '📍' : '▫️'} [{asset.roomName}] {asset.description.slice(0, 25)}... ({asset.category})
                          </option>
                        );
                      })}
                    </select>
                    
                    {selectedAssetId && (
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[10px] text-indigo-300 flex items-center gap-1">
                        <span className="material-icons text-xs">info</span>
                        Click anywhere on the grid canvas to anchor this asset.
                      </div>
                    )}
                  </div>
                </div>

                {/* Segments Inspector list */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Canvas Segments</h4>
                    <span className="text-[9px] text-slate-500">{recon.walls.length} items</span>
                  </div>
                  
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1 border border-slate-850 rounded-lg p-1.5 bg-slate-900/40">
                    {recon.walls.map((w) => (
                      <div key={w.id} className="text-[10px] bg-slate-900 px-2 py-1.5 rounded flex items-center justify-between">
                        <div className="font-mono text-slate-300">
                          <span className={`w-2 h-2 rounded-full inline-block mr-1.5 ${w.type === 'wall' ? 'bg-slate-400' : w.type === 'window' ? 'bg-sky-400' : 'bg-rose-400'}`}></span>
                          {w.type.toUpperCase()}: ({w.x1}, {w.y1}) ➔ ({w.x2}, {w.y2})
                        </div>
                        <button 
                          onClick={() => deleteWallSegment(w.id)}
                          className="text-slate-500 hover:text-red-400"
                        >
                          <span className="material-icons text-xs">close</span>
                        </button>
                      </div>
                    ))}
                    {recon.walls.length === 0 && (
                      <p className="text-[9px] text-slate-500 italic text-center py-2">No walls drawn yet. Draw walls or load template.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Clear Canvas/Reset and export controls */}
              <div className="border-t border-slate-800 pt-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={resetLayout}
                    className="border border-slate-800 hover:bg-slate-900 text-slate-400 text-xs font-bold py-2 rounded-lg transition"
                  >
                    Clear Layout
                  </button>
                  <button 
                    onClick={exportToSVGFile}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-1"
                  >
                    <span className="material-icons text-sm">download</span> Export SVG
                  </button>
                </div>
              </div>

            </div>

            {/* Canvas Column */}
            <div className="lg:col-span-8 bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col gap-4">
              
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div className="text-xs">
                  <span className="font-bold text-slate-300">Active Blueprint Tool:</span>{' '}
                  <span className="font-mono text-indigo-400 capitalize px-2 py-0.5 bg-indigo-950/40 rounded border border-indigo-900/50">
                    {drawMode === 'select' ? 'Select / Inspect mode' : `Drawing: ${drawMode}`}
                  </span>
                </div>
                
                <div className="flex gap-4 text-[10px] text-slate-400 font-mono">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-1 bg-slate-400 inline-block"></span> Wall
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-1 bg-sky-400 inline-block"></span> Window
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-1 bg-rose-400 inline-block"></span> Door
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span> Placed Asset
                  </div>
                </div>
              </div>

              {/* Main SVG Coordinate Canvas */}
              <div className="flex items-center justify-center bg-slate-900 rounded-2xl border border-slate-800 p-4 h-[440px] relative overflow-hidden select-none">
                
                {/* SVG Schematic Canvas */}
                <svg
                  width={canvasPixelSize}
                  height={canvasPixelSize}
                  viewBox={`0 0 ${canvasPixelSize} ${canvasPixelSize}`}
                  onMouseDown={handleGridMouseDown}
                  onMouseMove={handleGridMouseMove}
                  onMouseUp={handleGridMouseUp}
                  className="bg-slate-950 shadow-2xl border border-slate-800 rounded-lg cursor-crosshair"
                >
                  
                  {/* Grid Lines */}
                  {Array.from({ length: maxCoordinate * 2 + 1 }).map((_, i) => {
                    const pos = (i * gridSpacing) / 2;
                    const isMajor = i % 2 === 0;
                    return (
                      <React.Fragment key={i}>
                        {/* Vertical line */}
                        <line
                          x1={pos}
                          y1={0}
                          x2={pos}
                          y2={canvasPixelSize}
                          stroke={isMajor ? '#1e293b' : '#0f172a'}
                          strokeWidth={isMajor ? 1 : 0.5}
                        />
                        {/* Horizontal line */}
                        <line
                          x1={0}
                          y1={pos}
                          x2={canvasPixelSize}
                          y2={pos}
                          stroke={isMajor ? '#1e293b' : '#0f172a'}
                          strokeWidth={isMajor ? 1 : 0.5}
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* Draw Walls / Lines */}
                  {recon.walls.map((w) => {
                    let strokeColor = '#f1f5f9'; // wall color
                    let strokeWidth = 3;
                    let strokeDash = '';
                    
                    if (w.type === 'window') {
                      strokeColor = '#0ea5e9'; // sky cyan for windows
                      strokeWidth = 4;
                    } else if (w.type === 'door') {
                      strokeColor = '#e11d48'; // red swing door
                      strokeWidth = 2;
                      strokeDash = '3,3';
                    }

                    return (
                      <g key={w.id}>
                        <line
                          x1={w.x1 * gridSpacing}
                          y1={w.y1 * gridSpacing}
                          x2={w.x2 * gridSpacing}
                          y2={w.y2 * gridSpacing}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeDasharray={strokeDash}
                          className="transition-all hover:stroke-indigo-400 hover:stroke-[5px]"
                          onClick={(e) => {
                            if (drawMode === 'select') {
                              e.stopPropagation();
                              if (confirm(`Remove this ${w.type} segment?`)) {
                                deleteWallSegment(w.id);
                              }
                            }
                          }}
                        />
                      </g>
                    );
                  })}

                  {/* Draw Placed Assets */}
                  {recon.assets.map((a) => {
                    const px = a.x * gridSpacing;
                    const py = a.y * gridSpacing;
                    return (
                      <g 
                        key={a.assetId} 
                        className="cursor-pointer"
                        onClick={(e) => {
                          if (drawMode === 'select') {
                            e.stopPropagation();
                            if (confirm(`Remove asset placement for "${a.assetName}"?`)) {
                              deletePlacedAsset(a.assetId);
                            }
                          }
                        }}
                      >
                        <circle
                          cx={px}
                          cy={py}
                          r={8}
                          fill="#4f46e5"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                          className="hover:scale-125 transition-transform"
                        />
                        <text
                          x={px}
                          y={py + 3}
                          fontSize={8}
                          fontWeight="bold"
                          fill="#ffffff"
                          textAnchor="middle"
                        >
                          {a.category.charAt(0)}
                        </text>
                        <text
                          x={px}
                          y={py - 12}
                          fontSize={6}
                          fontWeight="bold"
                          fill="#94a3b8"
                          textAnchor="middle"
                        >
                          {a.assetName.slice(0, 10)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Draw Hover Marker / Preview snapped intersection point */}
                  {hoverGridPos && (
                    <circle
                      cx={hoverGridPos.x * gridSpacing}
                      cy={hoverGridPos.y * gridSpacing}
                      r={4}
                      fill="#818cf8"
                      opacity={0.7}
                      pointerEvents="none"
                    />
                  )}

                  {/* Draw Drag Line Preview */}
                  {dragStart && hoverGridPos && (
                    <line
                      x1={dragStart.x * gridSpacing}
                      y1={dragStart.y * gridSpacing}
                      x2={hoverGridPos.x * gridSpacing}
                      y2={hoverGridPos.y * gridSpacing}
                      stroke="#818cf8"
                      strokeWidth={2}
                      strokeDasharray="4,4"
                      pointerEvents="none"
                    />
                  )}
                </svg>

                {/* Snapped Coordinate Live HUD */}
                {hoverGridPos && (
                  <div className="absolute bottom-6 right-6 bg-slate-950/90 border border-slate-800 text-[10px] font-mono font-bold text-slate-300 px-3 py-1.5 rounded-lg flex gap-3">
                    <div>X: {hoverGridPos.x}</div>
                    <div>Y: {hoverGridPos.y}</div>
                    <div className="text-indigo-400">Dim: {(hoverGridPos.x * 0.5).toFixed(1)}m, {(hoverGridPos.y * 0.5).toFixed(1)}m</div>
                  </div>
                )}
              </div>

              {/* Status Display Area */}
              <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shrink-0"></span>
                  <span className="font-medium text-slate-400 italic">{statusMessage}</span>
                </div>
                {drawMode === 'select' && recon.walls.length > 0 && (
                  <span className="text-[10px] text-slate-500">Click any line to remove it.</span>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
