import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, ZoomIn, Sparkles, UploadCloud, FileImage, ShieldAlert } from 'lucide-react';
import { Room, Asset } from '../types';
import { ASSET_CATEGORIES, CONDITION_OPTIONS, RISK_OPTIONS, RISK_COLORS } from '../constants';
import { removeRoomImage } from '../services/roomImages';

interface RoomAssessmentViewProps {
  currentRoomIndex: number;
  rooms: Room[];
  currentRoom: Room;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  updateCurrentRoom: (updates: Partial<Room>) => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  generateAssetsWithAI: () => void;
  processing: boolean;
  updateAsset: (assetId: string, field: keyof Asset, value: any) => void;
  setEditingAsset: (asset: Asset | null) => void;
  batchMode: boolean;
  toggleBatchMode: () => void;
  selectedAssetIds: Set<string>;
  toggleAssetSelection: (id: string) => void;
  batchAction: (action: 'verify' | 'unverify' | 'delete') => void;
  setPreviewImage: (src: string | null) => void;
  hasEditLock: boolean;
}

export const RoomAssessmentView: React.FC<RoomAssessmentViewProps> = ({
  currentRoomIndex,
  rooms,
  currentRoom,
  goToPrevPage,
  goToNextPage,
  updateCurrentRoom,
  handleImageUpload,
  generateAssetsWithAI,
  processing,
  updateAsset,
  setEditingAsset,
  batchMode,
  toggleBatchMode,
  selectedAssetIds,
  toggleAssetSelection,
  batchAction,
  setPreviewImage,
  hasEditLock,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Drag-and-drop bypasses the input's accept="image/*" filter
    const imageFiles = Array.from(e.dataTransfer.files || []).filter((f: File) => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      const syntheticEvent = {
        target: {
          files: imageFiles
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleImageUpload(syntheticEvent);
    }
  };

  const addSamplePhoto = () => {
    if (currentRoom.images.length >= 10) {
      alert("Max 10 images per room reached.");
      return;
    }

    const sampleImages = [
      {
        name: "Plant Room Switchboard DB-01.jpg",
        dataUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'><rect width='800' height='600' fill='%231e293b'/><rect x='80' y='60' width='640' height='480' rx='16' fill='%23334155' stroke='%23475569' stroke-width='4'/><rect x='120' y='100' width='260' height='380' rx='8' fill='%230f172a' stroke='%2338bdf8' stroke-width='2'/><rect x='420' y='100' width='260' height='380' rx='8' fill='%230f172a' stroke='%2338bdf8' stroke-width='2'/><circle cx='180' cy='160' r='16' fill='%23ef4444'/><circle cx='240' cy='160' r='16' fill='%23eab308'/><circle cx='300' cy='160' r='16' fill='%2322c55e'/><rect x='150' y='220' width='200' height='30' rx='4' fill='%23475569'/><rect x='150' y='270' width='200' height='30' rx='4' fill='%23475569'/><rect x='150' y='320' width='200' height='30' rx='4' fill='%23475569'/><rect x='150' y='370' width='200' height='30' rx='4' fill='%23475569'/><text x='400' y='525' font-family='sans-serif' font-size='20' font-weight='bold' fill='%23f8fafc' text-anchor='middle'>MAIN SWITCHBOARD MSB-01 (CIVIC CENTRE)</text></svg>"
      },
      {
        name: "HVAC Rooftop Unit AHU-02.jpg",
        dataUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'><rect width='800' height='600' fill='%230f172a'/><rect x='100' y='120' width='600' height='360' rx='12' fill='%231e293b' stroke='%2364748b' stroke-width='6'/><circle cx='260' cy='300' r='100' fill='%23334155' stroke='%2338bdf8' stroke-width='6'/><circle cx='540' cy='300' r='100' fill='%23334155' stroke='%2338bdf8' stroke-width='6'/><path d='M260 200 L260 400 M160 300 L360 300' stroke='%2394a3b8' stroke-width='4'/><path d='M540 200 L540 400 M440 300 L640 300' stroke='%2394a3b8' stroke-width='4'/><rect x='320' y='60' width='160' height='60' fill='%23475569'/><text x='400' y='530' font-family='sans-serif' font-size='20' font-weight='bold' fill='%2338bdf8' text-anchor='middle'>ROOFTOP HVAC AHU-02 %26 CHILLER UNIT</text></svg>"
      }
    ];

    const selectedSample = sampleImages[currentRoom.images.length % sampleImages.length];
    const newImg = {
      id: crypto.randomUUID(),
      dataUrl: selectedSample.dataUrl,
      name: selectedSample.name,
      timestamp: Date.now()
    };

    updateCurrentRoom({ images: [...currentRoom.images, newImg] });
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Area / Room Header Navigation Panel */}
      <div className="bg-white rounded-xl shadow-md p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={goToPrevPage}
            className="p-2 border rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5 text-slate-700 hover:text-indigo-600 hover:border-indigo-200"
            title={currentRoomIndex === 0 ? "Back to Site Setup (Welcome Page)" : "Previous Room"}
          >
            <span className="material-icons flex items-center text-sm">arrow_back</span>
            {currentRoomIndex === 0 && <span className="text-xs font-bold pr-1">Back to Setup</span>}
          </button>
          <div className="text-left">
            <span className="text-xs uppercase tracking-wider text-indigo-500 font-bold">
              Area Assessment {currentRoomIndex + 1} of {rooms.length}
            </span>
            <h2 className="text-xl font-black text-gray-800">
              {currentRoom.roomName || 'Unnamed Area'}
            </h2>
          </div>
          <button 
            onClick={goToNextPage}
            className="p-2 border rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5 text-slate-700 hover:text-indigo-600 hover:border-indigo-200"
            title={currentRoomIndex === rooms.length - 1 ? "Finish and Go to Summary" : "Next Room"}
          >
            {currentRoomIndex === rooms.length - 1 && <span className="text-xs font-bold pl-1 text-indigo-600">Go to Summary</span>}
            <span className="material-icons flex items-center text-sm">{currentRoomIndex === rooms.length - 1 ? 'summarize' : 'arrow_forward'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-full">
            {currentRoom.assets.length} Assets Logged
          </span>
          <span className="text-xs bg-green-100 text-green-700 font-bold px-3 py-1.5 rounded-full">
            {currentRoom.assets.filter(a => a.verified).length} Verified
          </span>
        </div>
      </div>

      {/* Room metadata inputs */}
      <div className="bg-white rounded-xl shadow-md p-6 text-left">
        <div className="flex items-center gap-2 text-indigo-600 mb-4">
          <span className="material-icons">door_front</span>
          <h3 className="font-bold">Room Information</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input 
            value={currentRoom.buildingName || ''} 
            onChange={(e) => updateCurrentRoom({ buildingName: e.target.value })}
            placeholder="Building Name"
            className="px-4 py-2 border rounded-lg bg-gray-50 text-black placeholder-gray-500 text-sm focus:ring-2 focus:ring-indigo-500"
          />
          <input 
            value={currentRoom.roomName || ''} 
            onChange={(e) => updateCurrentRoom({ roomName: e.target.value })}
            placeholder="Room Name"
            className="px-4 py-2 border rounded-lg bg-gray-50 text-black placeholder-gray-500 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Capture Images Section */}
      <div className="bg-white rounded-xl shadow-md p-6 text-left">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 border-b pb-3">
          <div className="flex items-center gap-2 text-indigo-600">
            <Camera className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-gray-900">Capture & Upload Room Photos</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full">
              {currentRoom.images.length} / 10 Images Logged
            </span>
          </div>
        </div>

        {/* Image Grid + Upload Trigger Area */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-3 rounded-xl transition border-2 ${
            isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-indigo-100 bg-gray-50/50'
          }`}
        >
          {/* Uploaded Image Cards */}
          {currentRoom.images.map(img => (
            <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border shadow-sm bg-gray-900 flex items-center justify-center">
              <img 
                src={img.dataUrl} 
                className="w-full h-full object-cover transition duration-300 group-hover:scale-105" 
                alt={img.name || "Room photo"} 
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewImage(img.dataUrl)}
                  className="p-1.5 bg-white/90 text-gray-800 rounded-full hover:bg-white shadow transition"
                  title="View full resolution image"
                >
                  <ZoomIn className="w-4 h-4 text-indigo-600" />
                </button>
                <button 
                  type="button"
                  onClick={() => updateCurrentRoom(removeRoomImage(currentRoom, img.id))}
                  className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow transition"
                  title="Remove image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Primary Upload Tile */}
          {currentRoom.images.length < 10 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative overflow-hidden aspect-square border-2 border-dashed border-indigo-300 rounded-xl flex flex-col items-center justify-center text-indigo-600 hover:bg-indigo-50/80 hover:border-indigo-400 transition p-3 group focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer bg-white"
            >
              <ImagePlus className="w-8 h-8 text-indigo-600 group-hover:scale-110 transition duration-200 pointer-events-none" />
              <span className="text-xs font-bold mt-1.5 text-indigo-900 pointer-events-none">Add Photo</span>
              <span className="text-[10px] text-gray-500 text-center leading-tight mt-0.5 pointer-events-none">Browse or drop photo</span>
            </button>
          )}
        </div>

        {/* Quick Action Toolbar */}
        <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-indigo-200"
            >
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              Upload File(s)
            </button>

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="px-3.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-slate-200"
            >
              <Camera className="w-4 h-4 text-slate-600" />
              Take Camera Photo
            </button>

            <button
              type="button"
              onClick={() => {
                const url = prompt("Enter Image URL or Paste Image Link:");
                if (url && url.trim().length > 0) {
                  const newImg = {
                    id: crypto.randomUUID(),
                    dataUrl: url.trim(),
                    name: "External Image URL",
                    timestamp: Date.now()
                  };
                  updateCurrentRoom({ images: [...currentRoom.images, newImg] });
                }
              }}
              className="px-3.5 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-sky-200"
            >
              <span className="material-icons text-sm text-sky-600">link</span>
              Paste Image URL
            </button>

            {/* Programmatic Hidden Inputs */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
            />
            <input
              type="file"
              ref={cameraInputRef}
              className="hidden"
              accept="image/*"
              capture="environment"
              onChange={handleImageUpload}
            />

            <button
              type="button"
              onClick={addSamplePhoto}
              className="px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-emerald-200"
              title="Add sample plant room switchboard / HVAC photos"
            >
              <FileImage className="w-4 h-4 text-emerald-600" />
              + Add Sample Photo
            </button>
          </div>

          <button 
            type="button"
            onClick={generateAssetsWithAI}
            disabled={currentRoom.images.length === 0 || processing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none text-xs font-bold ml-auto"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            Generate Asset List with AI ({currentRoom.images.length})
          </button>
        </div>
      </div>

      {/* Detected Assets Section */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden text-left">
        <div className="bg-gray-50 px-6 py-4 border-b flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-indigo-600">
            <span className="material-icons">table_chart</span>
            <h3 className="font-bold">Detected Assets</h3>
            <div className="flex gap-4 items-center ml-4 bg-gray-100 px-3 py-1 rounded-full">
              <span className="text-xs">
                <span className="font-bold text-green-600">{currentRoom.assets.filter(a => a.verified).length}</span>
                <span className="text-gray-500">/{currentRoom.assets.length} Verified</span>
              </span>
              <span className="text-xs text-blue-600 font-medium pl-2 border-l border-gray-300">
                {currentRoom.assets.filter(a => a.aiDetected && !a.verified).length} AI Pending
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {batchMode && (
              <>
                <button onClick={() => batchAction('verify')} className="bg-green-100 text-green-700 px-3 py-1 rounded text-xs font-bold hover:bg-green-200">Verify Selected</button>
                <button onClick={() => batchAction('delete')} className="bg-red-100 text-red-700 px-3 py-1 rounded text-xs font-bold hover:bg-red-200">Delete Selected</button>
              </>
            )}
            <button 
              onClick={toggleBatchMode} 
              className={`px-3 py-1 rounded text-xs font-bold border ${batchMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'}`}
            >
              {batchMode ? 'Done' : 'Batch Mode'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                {batchMode && <th className="px-4 py-3 w-8"></th>}
                <th className="px-4 py-3 w-16">Image</th>
                <th className="px-4 py-3 w-48">Category</th>
                <th className="px-4 py-3 w-64">Description</th>
                <th className="px-4 py-3 w-28">Condition</th>
                <th className="px-4 py-3 w-20">Risk</th>
                <th className="px-4 py-3 w-16">Age</th>
                <th className="px-4 py-3 w-64">Justification</th>
                <th className="px-4 py-3 w-48">Notes</th>
                <th className="px-4 py-3 w-16">Qty</th>
                <th className="px-4 py-3 w-24">Cost ($)</th>
                <th className="px-4 py-3 w-20">RUL (yr)</th>
                <th className="px-4 py-3 w-12 text-center">AI</th>
                <th className="px-4 py-3 w-16 text-center">Human ✓</th>
                <th className="px-4 py-3 w-12 text-center">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {currentRoom.assets.length === 0 ? (
                <tr>
                  <td colSpan={batchMode ? 16 : 15} className="px-4 py-8 text-center text-gray-400">
                    No assets detected yet. Upload images and generate.
                  </td>
                </tr>
              ) : (
                currentRoom.assets.map(asset => (
                  <tr key={asset.id} className={`hover:bg-gray-100 group border-l-4 transition-colors ${
                    asset.riskRating === 'Extreme' ? 'border-red-600 bg-red-50' :
                    asset.riskRating === 'High' ? 'border-orange-500 bg-orange-50' :
                    asset.riskRating === 'Medium' ? 'border-yellow-400' :
                    'border-transparent'
                  } ${asset.verified && asset.riskRating !== 'Extreme' && asset.riskRating !== 'High' ? 'bg-green-50/50' : ''}`}>
                    {batchMode && (
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          checked={selectedAssetIds.has(asset.id)}
                          onChange={() => toggleAssetSelection(asset.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {currentRoom.croppedImages[asset.id] ? (
                        <img 
                          src={currentRoom.croppedImages[asset.id]} 
                          className="w-12 h-12 object-contain border rounded bg-white cursor-zoom-in hover:opacity-80 transition shadow-sm" 
                          alt="Asset"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(currentRoom.croppedImages[asset.id]);
                          }}
                          title="Click to magnify"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-white border rounded shadow-sm flex items-center justify-center text-gray-300">
                          <span className="material-icons text-sm">image_not_supported</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={asset.category}
                        onChange={(e) => updateAsset(asset.id, 'category', e.target.value)}
                        className="w-full min-w-[140px] bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1.5 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                      >
                        {!ASSET_CATEGORIES.includes(asset.category) && <option value={asset.category}>{asset.category}</option>}
                        {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <textarea 
                        value={asset.description}
                        onChange={(e) => updateAsset(asset.id, 'description', e.target.value)}
                        className="w-full min-w-[180px] bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition min-h-[44px]"
                        rows={2}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={asset.condition}
                        onChange={(e) => updateAsset(asset.id, 'condition', e.target.value)}
                        className={`rounded px-2 py-1 text-xs font-bold focus:outline-none ${
                          asset.condition === 'Good' || asset.condition === 'Excellent' ? 'bg-green-100 text-green-800' :
                          asset.condition === 'Fair' || asset.condition === 'Average' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}
                      >
                        {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 group/risk">
                        <select
                          value={asset.riskRating || 'Low'}
                          onChange={(e) => updateAsset(asset.id, 'riskRating', e.target.value)}
                          className={`rounded px-2 py-1 text-xs font-bold border-0 cursor-pointer focus:outline-none ${
                            asset.riskRating === 'Extreme' ? 'bg-red-600 text-white' :
                            asset.riskRating === 'High' ? 'bg-orange-500 text-white shadow-sm' :
                            asset.riskRating === 'Medium' ? 'bg-yellow-400 text-yellow-900' :
                            'bg-green-100 text-green-800'
                          }`}
                        >
                          {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {asset.riskHistory && asset.riskHistory.length > 0 && (
                          <div className="relative">
                            <span className="material-icons text-gray-400 hover:text-indigo-600 cursor-help text-[16px] transition-colors">history</span>
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-gray-900 text-white text-xs rounded shadow-lg p-2 opacity-0 group-hover/risk:opacity-100 pointer-events-none transition-opacity z-10 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-gray-900">
                              <div className="font-bold border-b border-gray-700 pb-1 mb-1">Risk History</div>
                              <ul className="space-y-1 max-h-32 overflow-y-auto">
                                {asset.riskHistory.slice().reverse().map((rec, i) => (
                                  <li key={i} className="flex justify-between items-center text-[10px]">
                                    <span className="text-gray-400">{new Date(rec.timestamp).toLocaleDateString()}</span>
                                    <span>{rec.previousRisk || 'Low'} <span className="text-gray-500">→</span> <span className={rec.newRisk === 'Extreme' ? 'text-red-400' : rec.newRisk === 'High' ? 'text-orange-400' : 'text-gray-200'}>{rec.newRisk}</span></span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="text"
                        value={asset.age || ''}
                        onChange={(e) => updateAsset(asset.id, 'age', e.target.value)}
                        className="w-16 bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1 text-center text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition font-medium"
                        placeholder="-"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <textarea 
                        value={asset.justification}
                        onChange={(e) => updateAsset(asset.id, 'justification', e.target.value)}
                        className="w-full min-w-[160px] bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1.5 text-xs text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition min-h-[44px]"
                        placeholder="No justification"
                        rows={2}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <textarea 
                        value={asset.notes || ''}
                        onChange={(e) => updateAsset(asset.id, 'notes', e.target.value)}
                        className="w-full min-w-[160px] bg-yellow-50/50 border border-yellow-200 hover:border-yellow-300 rounded px-2 py-1.5 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition min-h-[44px]"
                        placeholder="Add notes..."
                        rows={2}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="text"
                        value={asset.quantity}
                        onChange={(e) => updateAsset(asset.id, 'quantity', e.target.value)}
                        className="w-16 bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1 text-center text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input 
                        value={asset.cost}
                        onChange={(e) => updateAsset(asset.id, 'cost', e.target.value)}
                        className="w-24 bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1 text-right text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input 
                        value={asset.rul}
                        onChange={(e) => updateAsset(asset.id, 'rul', e.target.value)}
                        className="w-16 bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1 text-center text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      {asset.aiDetected && (
                        <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">AI</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button 
                        onClick={() => updateAsset(asset.id, 'verified', !asset.verified)}
                        className={`rounded-full p-1 transition ${asset.verified ? 'bg-green-500 text-white' : 'text-gray-300 hover:bg-gray-100'}`}
                        title="Toggle Verification"
                      >
                        <span className="material-icons text-sm">{asset.verified ? 'check' : 'radio_button_unchecked'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => setEditingAsset(asset)}
                        className="rounded-full p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        title="Edit Asset"
                      >
                        <span className="material-icons text-lg">edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer step-by-step navigation section */}
      <div className="bg-white rounded-xl shadow-md p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border border-gray-100">
        <button
          onClick={goToPrevPage}
          className="w-full sm:w-auto px-5 py-2.5 border border-slate-350 rounded-lg hover:bg-slate-50 text-slate-700 font-bold text-sm transition flex items-center justify-center gap-2 shadow-xs hover:border-indigo-300"
          title={currentRoomIndex === 0 ? "Back to Site Setup (Welcome Page)" : "Go to Previous Room/Area"}
        >
          <span className="material-icons text-sm">arrow_back</span>
          {currentRoomIndex === 0 ? "Back to Site Setup" : "Previous Room / Area"}
        </button>
        
        <div className="text-center">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Navigation Progress</p>
          <p className="text-sm font-black text-indigo-700 font-mono">
            Room/Area {currentRoomIndex + 1} of {rooms.length}
          </p>
        </div>

        <button
          onClick={goToNextPage}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
          title={currentRoomIndex === rooms.length - 1 ? "Finish and Go to Summary" : "Go to Next Room/Area"}
        >
          {currentRoomIndex === rooms.length - 1 ? "Go to Summary" : "Next Room / Area"}
          <span className="material-icons text-sm">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};
