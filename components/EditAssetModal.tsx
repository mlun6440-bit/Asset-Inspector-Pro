import React, { useState } from 'react';
import { Asset, Room, AuditEntry } from '../types';
import { ASSET_CATEGORIES, CONDITION_OPTIONS, RISK_OPTIONS } from '../constants';

interface EditAssetModalProps {
  editingAsset: Asset;
  setEditingAsset: (asset: Asset | null) => void;
  currentRoom: Room;
  setPreviewImage: (src: string | null) => void;
  saveEditedAsset: (updatedAsset: Asset) => void;
}

export const EditAssetModal: React.FC<EditAssetModalProps> = ({
  editingAsset,
  setEditingAsset,
  currentRoom,
  setPreviewImage,
  saveEditedAsset,
}) => {
  const [localAsset, setLocalAsset] = useState<Asset>({ ...editingAsset });

  const handleFieldChange = (field: keyof Asset, value: any) => {
    setLocalAsset(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = () => {
    saveEditedAsset(localAsset);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-indigo-50 rounded-t-xl">
          <h3 className="text-lg font-bold text-indigo-800 flex items-center gap-2">
            <span className="material-icons">edit</span> Edit Asset Details
          </h3>
          <button onClick={() => setEditingAsset(null)} className="text-gray-500 hover:text-gray-700">
            <span className="material-icons">close</span>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Visual Discovery & Audit History */}
          <div className="col-span-1 md:col-span-5 space-y-4">
            
            {/* Extracted Asset Image Preview Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white rounded px-2 py-0.5 self-start mb-2 shadow-xs">
                Identified Asset Image
              </span>
              
              {currentRoom.croppedImages[localAsset.id] ? (
                <div className="relative w-full h-48 bg-white border border-slate-200 rounded-md overflow-hidden flex items-center justify-center group shadow-inner">
                  <img 
                    src={currentRoom.croppedImages[localAsset.id]} 
                    className="max-w-full max-h-full object-contain cursor-zoom-in hover:scale-[1.03] transition-transform duration-200" 
                    alt="Extracted Asset"
                    onClick={() => setPreviewImage(currentRoom.croppedImages[localAsset.id])}
                    title="Click to view full screen"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="material-icons text-xs">zoom_in</span> Click to zoom
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 rounded-md py-12 flex flex-col items-center justify-center text-slate-400 bg-white">
                  <span className="material-icons text-4xl mb-1">image_not_supported</span>
                  <span className="text-xs font-semibold">No cropped image available</span>
                </div>
              )}

              {/* Toggle context image if available */}
              {localAsset.sourceImageIndex !== undefined && currentRoom.images[localAsset.sourceImageIndex] && (
                <button
                  type="button"
                  onClick={() => setPreviewImage(currentRoom.images[localAsset.sourceImageIndex!].dataUrl)}
                  className="mt-3 w-full text-xs text-indigo-700 hover:text-indigo-900 font-bold flex items-center justify-center gap-1.5 border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-100/70 py-2 rounded-md transition duration-150 shadow-inner"
                >
                  <span className="material-icons text-sm">filter_center_focus</span> View Context/Source Image
                </button>
              )}
            </div>

            {/* Governance & Audit History */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-gray-500 max-h-36 overflow-y-auto shadow-xs">
              <strong className="block mb-1 text-slate-700 font-bold uppercase tracking-wider text-[10px]">Governance & Audit History:</strong>
              <ul className="space-y-1 divide-y divide-slate-100">
                {(localAsset.auditTrail || []).map((log, i) => (
                  <li key={i} className="flex gap-2 pt-1.5 first:pt-0">
                    <span className="font-mono text-slate-400 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`font-bold shrink-0 ${log.actor === 'AI' ? 'text-purple-600' : 'text-blue-600'}`}>[{log.actor}]</span>
                    <span className="text-gray-700">{log.action}: {log.details}</span>
                  </li>
                ))}
                {(!localAsset.auditTrail || localAsset.auditTrail.length === 0) && <li className="text-gray-400 italic">No history recorded.</li>}
              </ul>
            </div>

            {/* Risk Trajectory */}
            {localAsset.riskHistory && localAsset.riskHistory.length > 0 && (
              <div className="bg-white border border-indigo-100 rounded-lg p-3 shadow-xs">
                <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-2 flex items-center gap-1">
                  <span className="material-icons text-sm">timeline</span> Risk Trajectory
                </label>
                <div className="space-y-3 border-l-2 border-indigo-200 ml-2 pl-3 py-0.5 max-h-36 overflow-y-auto">
                  {localAsset.riskHistory.map((history, i) => (
                    <div key={i} className="relative">
                      <div className={`absolute -left-[17px] top-1 w-2 h-2 rounded-full ring-4 ring-white ${history.newRisk === 'Extreme' ? 'bg-red-500' : history.newRisk === 'High' ? 'bg-orange-500' : history.newRisk === 'Medium' ? 'bg-yellow-400' : 'bg-green-500'}`}></div>
                      <div className="text-[9px] text-gray-400 font-mono uppercase tracking-wider">
                        {new Date(history.timestamp).toLocaleString()} • <strong className={history.actor === 'AI' ? 'text-purple-600' : 'text-blue-600'}>{history.actor}</strong>
                      </div>
                      <div className="text-xs text-gray-700">
                        Changed from <span className="font-medium text-gray-900">{history.previousRisk || 'Initial'}</span> to <span className={`font-bold ${history.newRisk === 'Extreme' ? 'text-red-600' : history.newRisk === 'High' ? 'text-orange-500' : history.newRisk === 'Medium' ? 'text-yellow-600' : 'text-green-600'}`}>{history.newRisk}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Editable Metadata Controls */}
          <div className="col-span-1 md:col-span-7 space-y-4 border-t md:border-t-0 md:border-l md:pl-6 border-slate-200">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Category</label>
              <select 
                value={localAsset.category}
                onChange={(e) => handleFieldChange('category', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm text-black"
              >
                {!ASSET_CATEGORIES.includes(localAsset.category) && <option value={localAsset.category}>{localAsset.category}</option>}
                <option value="">Select Category...</option>
                {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description</label>
              <textarea 
                value={localAsset.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-20 text-black placeholder-gray-400"
                placeholder="Detailed description..."
              />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Condition</label>
                <select 
                  value={localAsset.condition}
                  onChange={(e) => handleFieldChange('condition', e.target.value)}
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-xs text-black"
                >
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Risk Rating</label>
                <select 
                  value={localAsset.riskRating || 'Low'}
                  onChange={(e) => handleFieldChange('riskRating', e.target.value)}
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-xs text-black"
                >
                  {RISK_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Age (Yrs)</label>
                <input 
                  type="text"
                  value={localAsset.age || ''}
                  onChange={(e) => handleFieldChange('age', e.target.value)}
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs text-black"
                  placeholder="e.g. 15"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Quantity</label>
                <input 
                  type="text"
                  value={localAsset.quantity}
                  onChange={(e) => handleFieldChange('quantity', e.target.value)}
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs text-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Justification</label>
              <textarea 
                value={localAsset.justification}
                onChange={(e) => handleFieldChange('justification', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-16 text-black placeholder-gray-400"
                placeholder="Why is it in this condition?"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Notes (Inspector Observations)</label>
              <textarea 
                value={localAsset.notes || ''}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm h-16 bg-yellow-50 text-black placeholder-gray-400"
                placeholder="Add any additional notes or recommendations..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Cost ($)</label>
                <input 
                  type="text"
                  value={localAsset.cost}
                  onChange={(e) => handleFieldChange('cost', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">RUL (Years)</label>
                <input 
                  type="text"
                  value={localAsset.rul}
                  onChange={(e) => handleFieldChange('rul', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-black"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-2">
          <button 
            onClick={() => setEditingAsset(null)}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md transform active:scale-95 transition text-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
