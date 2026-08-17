import React, { useRef } from 'react';
import { SiteInfo } from '../types';

interface WelcomeViewProps {
  siteInfo: SiteInfo;
  handleSiteInfoChange: (key: keyof SiteInfo, value: any) => void;
  addressSuggestions: any[];
  showSuggestions: boolean;
  setShowSuggestions: (show: boolean) => void;
  isSearchingAddress: boolean;
  addressError: string | null;
  detectLocation: () => void;
  handleAddressInputChange: (val: string) => void;
  handleSelectSuggestion: (suggestion: any) => void;
  handleDocumentUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleVendorRegisterUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  startAssessment: () => void;
  loadDemo: () => void;
  setAppState: React.Dispatch<React.SetStateAction<any>>;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  siteInfo,
  handleSiteInfoChange,
  addressSuggestions,
  showSuggestions,
  setShowSuggestions,
  isSearchingAddress,
  addressError,
  detectLocation,
  handleAddressInputChange,
  handleSelectSuggestion,
  handleDocumentUpload,
  handleVendorRegisterUpload,
  startAssessment,
  loadDemo,
  setAppState,
}) => {
  const docInputRef = useRef<HTMLInputElement>(null);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full transform transition-all animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
            <span className="material-icons text-4xl">assignment</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Site Information</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site / Building Name *</label>
            <input 
              className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500 text-sm"
              placeholder="e.g. Dubbo Civic Centre"
              value={siteInfo.name}
              onChange={(e) => handleSiteInfoChange('name', e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site Address *</label>
            <div className="relative text-left">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input 
                    className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500 pr-10 text-sm"
                    placeholder="e.g. 123 Main St"
                    value={siteInfo.address}
                    onChange={(e) => handleAddressInputChange(e.target.value)}
                    onFocus={() => {
                      if (addressSuggestions.length > 0) setShowSuggestions(true);
                    }}
                  />
                  {isSearchingAddress && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                      <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  )}
                </div>
                <button 
                  onClick={detectLocation}
                  className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 flex items-center justify-center gap-1 transition"
                  title="Detect Location"
                >
                  <span className="material-icons">my_location</span>
                </button>
              </div>

              {/* Autocomplete Suggestions Menu Dropdown */}
              {showSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                  {addressSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50/50 text-xs text-slate-800 transition flex flex-col gap-0.5"
                    >
                      <div className="font-semibold text-gray-900 truncate">{suggestion.label}</div>
                      <div className="font-mono text-[9px] text-gray-400">Coords: {suggestion.latitude.toFixed(4)}, {suggestion.longitude.toFixed(4)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dynamic Location Error Alert */}
            {addressError && (
              <div className="mt-2 text-xs bg-red-50 border border-red-100 text-red-700 p-2.5 rounded-lg flex items-start gap-1.5 shadow-sm animate-fade-in">
                <span className="material-icons text-red-500 text-sm mt-0.5 animate-bounce">info</span>
                <span className="leading-relaxed">{addressError}</span>
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Rooms</label>
            <input 
              type="number"
              className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-500 text-sm"
              value={siteInfo.numRooms}
              onChange={(e) => handleSiteInfoChange('numRooms', parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="border border-dashed border-gray-300 p-4 rounded-xl">
            <label className="block text-sm font-medium text-gray-700 mb-2">Service / PM Reports (PDF/Image)</label>
            <button 
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="relative overflow-hidden flex items-center justify-center w-full p-4 border-2 border-dashed border-indigo-200 bg-indigo-50 rounded-lg cursor-pointer hover:bg-indigo-100 transition text-left"
            >
              <div className="flex flex-col items-center pointer-events-none">
                <span className="material-icons text-indigo-500 mb-1">upload_file</span>
                <span className="text-xs text-indigo-700 font-medium">Upload Document for AI Analysis</span>
              </div>
            </button>
            <input 
              type="file" 
              ref={docInputRef}
              className="hidden" 
              accept="application/pdf,image/*" 
              onChange={handleDocumentUpload} 
            />
            {siteInfo.documents && siteInfo.documents.length > 0 && (
              <div className="mt-3 space-y-2">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Processed Documents</h4>
                {siteInfo.documents.map(doc => (
                  <div key={doc.id} className="bg-gray-100 p-2 rounded text-xs flex justify-between items-center group">
                    <div className="truncate font-medium text-gray-700" title={doc.summary}>
                      <span className="material-icons text-sm align-middle mr-1 text-gray-500">description</span>
                      {doc.name}
                    </div>
                    <button 
                      onClick={() => {
                        setAppState((prev: any) => ({
                          ...prev,
                          siteInfo: {
                            ...prev.siteInfo,
                            documents: prev.siteInfo.documents?.filter((d: any) => d.id !== doc.id)
                          }
                        }));
                      }}
                      className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-dashed border-gray-300 p-4 rounded-xl mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Vendor Asset Register / Audit Report</label>
            <p className="text-xs text-gray-500 mb-3">Upload a vendor asset register or inspection report (PDF, Excel, image). The AI can extract elements from tables, lists, or unstructured narrative text to automatically populate the assessment.</p>
            <button 
              type="button"
              onClick={() => vendorInputRef.current?.click()}
              className="relative overflow-hidden flex items-center justify-center w-full p-4 border-2 border-dashed border-green-200 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition text-left"
            >
              <div className="flex flex-col items-center pointer-events-none">
                <span className="material-icons text-green-500 mb-1">domain_verification</span>
                <span className="text-xs text-green-700 font-medium">Extract Vendor Data</span>
              </div>
            </button>
            <input 
              type="file" 
              ref={vendorInputRef}
              className="hidden" 
              accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/*" 
              onChange={handleVendorRegisterUpload} 
            />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3 mt-4">
            <span className="material-icons text-blue-600 mt-1">security</span>
            <div className="text-xs text-blue-800">
              <strong>Privacy Note:</strong> Turn on "Privacy Mode" in the top right to anonymize site data sent to AI.
            </div>
          </div>

          <button 
            onClick={startAssessment}
            disabled={!siteInfo.name || !siteInfo.address}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transform active:scale-95 transition-all mt-6 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <span className="material-icons">play_circle</span> START ASSESSMENT
          </button>
          
          <button onClick={loadDemo} className="w-full text-indigo-600 text-sm font-medium hover:underline text-center">
            Load Demo Data
          </button>
        </div>
      </div>
    </div>
  );
};
