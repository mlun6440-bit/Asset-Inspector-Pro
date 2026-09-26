import React, { useRef } from 'react';
import { SiteInfo } from '../types';
import { GoogleMapComponent } from './GoogleMapComponent';
import { getGoogleMapsNavigationUrl } from '../services/googleMapsService';

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

  const hasCoordinates = siteInfo.latitude !== undefined && siteInfo.longitude !== undefined;
  const currentCoords = {
    lat: siteInfo.latitude ?? -33.8568,
    lng: siteInfo.longitude ?? 151.2153,
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-xl w-full transform transition-all animate-fade-in-up">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-indigo-600 shadow-inner">
            <span className="material-icons text-3xl">domain</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Facility & Site Setup</h2>
          <p className="text-xs text-gray-500 mt-1">Ground asset inspections with verified Google Maps geo-location</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              Site / Building Name *
            </label>
            <input 
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-400 text-sm"
              placeholder="e.g. Dubbo Civic Centre / Sydney Opera House Annex"
              value={siteInfo.name}
              onChange={(e) => handleSiteInfoChange('name', e.target.value)}
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                Google Maps Location & Address *
              </label>
              {hasCoordinates && (
                <span className="text-[10px] font-mono font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  GPS: {siteInfo.latitude?.toFixed(4)}, {siteInfo.longitude?.toFixed(4)}
                </span>
              )}
            </div>

            <div className="relative text-left">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input 
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-400 pr-10 text-sm"
                    placeholder="Search address or landmark on Google Maps..."
                    value={siteInfo.address}
                    onChange={(e) => handleAddressInputChange(e.target.value)}
                    onFocus={() => {
                      if (addressSuggestions.length > 0) setShowSuggestions(true);
                    }}
                  />
                  {isSearchingAddress && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                      <svg className="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  )}
                </div>
                <button 
                  type="button"
                  onClick={detectLocation}
                  className="px-3.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-100 flex items-center justify-center gap-1.5 transition text-xs font-semibold shadow-sm"
                  title="Detect Current GPS Location"
                >
                  <span className="material-icons text-base">my_location</span>
                  <span className="hidden sm:inline">GPS</span>
                </button>
              </div>

              {/* Autocomplete Suggestions Menu Dropdown */}
              {showSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-gray-100 animate-fade-in">
                  <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1">
                    <span className="material-icons text-xs text-indigo-500">place</span>
                    Google Maps Places Suggestions
                  </div>
                  {addressSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50/70 text-xs text-slate-800 transition flex flex-col gap-0.5 group"
                    >
                      <div className="font-semibold text-gray-900 group-hover:text-indigo-600 truncate flex items-center gap-1.5">
                        <span className="material-icons text-sm text-slate-400 group-hover:text-indigo-500">location_on</span>
                        <span>{suggestion.label}</span>
                      </div>
                      {suggestion.latitude && suggestion.longitude && (
                        <div className="font-mono text-[9px] text-gray-400 pl-5">
                          Coordinates: {suggestion.latitude.toFixed(5)}, {suggestion.longitude.toFixed(5)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dynamic Location Error Alert */}
            {addressError && (
              <div className="mt-2 text-xs bg-red-50 border border-red-100 text-red-700 p-2.5 rounded-xl flex items-start gap-2 shadow-sm animate-fade-in">
                <span className="material-icons text-red-500 text-sm mt-0.5">error_outline</span>
                <span className="leading-relaxed">{addressError}</span>
              </div>
            )}

            {/* Interactive Google Map Preview & Location Calibrator */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5 font-medium">
                <span className="flex items-center gap-1">
                  <span className="material-icons text-sm text-indigo-600">satellite_alt</span>
                  <span>Google Maps Aerial & Satellite View:</span>
                </span>
                <span className="text-[10px] text-slate-400">Drag or click pin to fine-tune coords</span>
              </div>
              <GoogleMapComponent
                center={currentCoords}
                zoom={16}
                mapType="satellite"
                height="220px"
                isDraggableMarker={true}
                onLocationChange={(newLoc) => {
                  setAppState((prev: any) => ({
                    ...prev,
                    siteInfo: {
                      ...prev.siteInfo,
                      latitude: newLoc.lat,
                      longitude: newLoc.lng,
                      ...(newLoc.address ? { address: newLoc.address } : {})
                    }
                  }));
                }}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              Number of Inspection Areas / Rooms
            </label>
            <input 
              type="number"
              min={1}
              max={100}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-black placeholder-gray-400 text-sm"
              value={siteInfo.numRooms}
              onChange={(e) => handleSiteInfoChange('numRooms', parseInt(e.target.value) || 1)}
            />
          </div>

          {/* Service / PM Reports */}
          <div className="border border-dashed border-gray-300 p-3.5 rounded-xl">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              Service / PM Reports (PDF/Image)
            </label>
            <button 
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="relative overflow-hidden flex items-center justify-center w-full p-3 border-2 border-dashed border-indigo-200 bg-indigo-50/70 rounded-xl cursor-pointer hover:bg-indigo-100 transition text-left"
            >
              <div className="flex flex-col items-center pointer-events-none">
                <span className="material-icons text-indigo-600 mb-0.5">upload_file</span>
                <span className="text-xs text-indigo-800 font-semibold">Upload Document for AI Grounding</span>
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
              <div className="mt-3 space-y-1.5">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Processed Documents ({siteInfo.documents.length})</h4>
                {siteInfo.documents.map(doc => (
                  <div key={doc.id} className="bg-gray-100 p-2 rounded-lg text-xs flex justify-between items-center group">
                    <div className="truncate font-medium text-gray-700 max-w-[80%]" title={doc.summary}>
                      <span className="material-icons text-xs align-middle mr-1 text-gray-500">description</span>
                      {doc.name}
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setAppState((prev: any) => ({
                          ...prev,
                          siteInfo: {
                            ...prev.siteInfo,
                            documents: prev.siteInfo.documents?.filter((d: any) => d.id !== doc.id)
                          }
                        }));
                      }}
                      className="text-red-500 hover:text-red-700 transition"
                    >
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vendor Asset Register */}
          <div className="border border-dashed border-gray-300 p-3.5 rounded-xl">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
              Vendor Asset Register / Audit Report
            </label>
            <p className="text-[11px] text-gray-500 mb-2.5">
              Upload vendor CSV, Excel, or PDF reports to automatically extract and register asset inventories.
            </p>
            <button 
              type="button"
              onClick={() => vendorInputRef.current?.click()}
              className="relative overflow-hidden flex items-center justify-center w-full p-3 border-2 border-dashed border-emerald-200 bg-emerald-50/70 rounded-xl cursor-pointer hover:bg-emerald-100 transition text-left"
            >
              <div className="flex flex-col items-center pointer-events-none">
                <span className="material-icons text-emerald-600 mb-0.5">domain_verification</span>
                <span className="text-xs text-emerald-800 font-semibold">Extract Vendor Data</span>
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

          <button 
            type="button"
            onClick={startAssessment}
            disabled={!siteInfo.name || !siteInfo.address}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg transform active:scale-95 transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <span className="material-icons">play_circle</span>
            <span>START ASSET ASSESSMENT</span>
          </button>
          
          <button 
            type="button"
            onClick={loadDemo} 
            className="w-full text-indigo-600 text-xs font-semibold hover:underline text-center py-1"
          >
            Load Demo Data (Sydney Opera House Annex)
          </button>
        </div>
      </div>
    </div>
  );
};
