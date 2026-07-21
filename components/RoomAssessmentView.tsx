import React from 'react';
import { Room, Asset } from '../types';
import { ASSET_CATEGORIES, CONDITION_OPTIONS, RISK_OPTIONS, RISK_COLORS } from '../constants';

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
  batchAction: (action: 'verify' | 'delete') => void;
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

      {/* Capture Images */}
      <div className="bg-white rounded-xl shadow-md p-6 text-left">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 text-indigo-600">
            <span className="material-icons">photo_camera</span>
            <h3 className="font-bold">Capture Images</h3>
          </div>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">{currentRoom.images.length} / 5</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {currentRoom.images.map(img => (
            <div key={img.id} className="relative w-32 h-32 flex-shrink-0">
              <img src={img.dataUrl} className="w-full h-full object-cover rounded-lg shadow-sm border" alt="Room" />
              <button 
                onClick={() => updateCurrentRoom({ images: currentRoom.images.filter(i => i.id !== img.id) })}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition"
              >
                <span className="material-icons text-xs">close</span>
              </button>
            </div>
          ))}
          <label className="w-32 h-32 flex-shrink-0 border-2 border-dashed border-indigo-300 rounded-lg flex flex-col items-center justify-center text-indigo-500 hover:bg-indigo-50 cursor-pointer transition">
            <span className="material-icons text-3xl">add_a_photo</span>
            <span className="text-xs mt-1">Add Photo</span>
            <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
          </label>
        </div>
        <div className="mt-6 flex justify-center">
          <button 
            onClick={generateAssetsWithAI}
            disabled={currentRoom.images.length === 0 || processing || !hasEditLock}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-full shadow-lg flex items-center gap-2 transition transform hover:scale-105 disabled:opacity-50 disabled:transform-none text-sm font-bold"
          >
            <span className="material-icons">auto_awesome</span> Generate Asset List
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
