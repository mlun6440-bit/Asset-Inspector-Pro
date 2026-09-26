import React, { useState } from 'react';

interface MobileAppFrameProps {
  children: React.ReactNode;
  onExitMobileMode: () => void;
  currentView?: string;
  viewMode?: 'single' | 'portfolio';
  onNavigate?: (view: string) => void;
  onTogglePortfolio?: () => void;
}

export const MobileAppFrame: React.FC<MobileAppFrameProps> = ({
  children,
  onExitMobileMode,
  currentView,
  viewMode = 'single',
  onNavigate,
  onTogglePortfolio
}) => {
  const [device, setDevice] = useState<'iphone' | 'pixel' | 'tablet'>('iphone');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [scale, setScale] = useState<number>(100);

  const deviceDimensions = {
    iphone: {
      portrait: { width: '400px', height: '840px', radius: 'rounded-[50px]', bezel: 'p-3' },
      landscape: { width: '840px', height: '420px', radius: 'rounded-[50px]', bezel: 'p-3' }
    },
    pixel: {
      portrait: { width: '420px', height: '870px', radius: 'rounded-[44px]', bezel: 'p-3' },
      landscape: { width: '870px', height: '430px', radius: 'rounded-[44px]', bezel: 'p-3' }
    },
    tablet: {
      portrait: { width: '740px', height: '920px', radius: 'rounded-[32px]', bezel: 'p-4' },
      landscape: { width: '920px', height: '620px', radius: 'rounded-[32px]', bezel: 'p-4' }
    }
  };

  const currentDim = deviceDimensions[device][orientation];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-4 px-2 select-none">
      {/* TOP CONTROL TOOLBAR */}
      <header className="w-full max-w-4xl bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-3 mb-4 shadow-xl flex flex-wrap items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <span className="material-icons text-sm">smartphone</span>
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              Mobile App Mode
              <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] px-1.5 py-0.5 rounded font-mono">
                LIVE PREVIEW
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">Simulating handheld field inspector view</p>
          </div>
        </div>

        {/* DEVICE & ORIENTATION SELECTORS */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Device Model Selector */}
          <div className="bg-slate-800/80 p-1 rounded-xl border border-slate-700 flex items-center gap-1">
            <button
              onClick={() => setDevice('iphone')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                device === 'iphone' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="iPhone 15 Pro format"
            >
              iPhone
            </button>
            <button
              onClick={() => setDevice('pixel')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                device === 'pixel' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Android Pixel format"
            >
              Pixel
            </button>
            <button
              onClick={() => setDevice('tablet')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                device === 'tablet' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tablet / iPad format"
            >
              Tablet
            </button>
          </div>

          {/* Orientation Toggle */}
          <div className="bg-slate-800/80 p-1 rounded-xl border border-slate-700 flex items-center gap-1">
            <button
              onClick={() => setOrientation('portrait')}
              className={`p-1.5 rounded-lg transition ${
                orientation === 'portrait' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Portrait Orientation"
            >
              <span className="material-icons text-sm">stay_current_portrait</span>
            </button>
            <button
              onClick={() => setOrientation('landscape')}
              className={`p-1.5 rounded-lg transition ${
                orientation === 'landscape' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Landscape Orientation"
            >
              <span className="material-icons text-sm">stay_current_landscape</span>
            </button>
          </div>

          {/* Zoom/Scale Toggle */}
          <div className="bg-slate-800/80 p-1 rounded-xl border border-slate-700 flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setScale(scale === 100 ? 90 : scale === 90 ? 80 : 100)}
              className="px-2 py-1 text-slate-300 hover:text-white font-mono"
              title="Toggle View Zoom Scale"
            >
              {scale}%
            </button>
          </div>

          {/* Exit / Return to Desktop Mode */}
          <button
            onClick={onExitMobileMode}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-md active:scale-95"
            title="Return to standard full desktop layout"
          >
            <span className="material-icons text-sm">desktop_windows</span>
            <span className="hidden sm:inline">Desktop View</span>
          </button>
        </div>
      </header>

      {/* PHONE/TABLET HARDWARE CHASSIS */}
      <div
        className="transition-all duration-300 ease-in-out flex flex-col items-center justify-center my-auto"
        style={{ transform: `scale(${scale / 100})`, transformOrigin: 'top center' }}
      >
        <div
          className={`relative bg-slate-900 border-[10px] sm:border-[12px] border-slate-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] ${currentDim.radius} ${currentDim.bezel} ring-2 ring-slate-700/60 flex flex-col`}
          style={{
            width: currentDim.width,
            height: currentDim.height,
            maxWidth: '96vw'
          }}
        >
          {/* HARDWARE BUTTON ACCENTS (Side physical buttons) */}
          <div className="absolute -left-4 top-24 w-1 h-12 bg-slate-700 rounded-l hidden sm:block"></div>
          <div className="absolute -left-4 top-40 w-1 h-12 bg-slate-700 rounded-l hidden sm:block"></div>
          <div className="absolute -right-4 top-28 w-1 h-16 bg-slate-700 rounded-r hidden sm:block"></div>

          {/* MOBILE STATUS BAR */}
          <div className="w-full bg-slate-950/90 backdrop-blur text-white px-5 py-2.5 rounded-t-[36px] flex items-center justify-between text-[11px] font-semibold shrink-0 select-none z-30 border-b border-white/5">
            <div className="flex items-center gap-1.5 font-medium tracking-tight">
              <span>9:41</span>
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
            </div>

            {/* DYNAMIC ISLAND / CAMERA NOTCH */}
            <div className="bg-black border border-white/10 px-3 py-1 rounded-full flex items-center gap-2 shadow-inner">
              <div className="w-2.5 h-2.5 bg-slate-900 rounded-full border border-slate-800"></div>
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="material-icons text-[14px]">signal_cellular_alt</span>
              <span className="material-icons text-[14px]">wifi</span>
              <div className="flex items-center gap-0.5 border border-slate-400/60 rounded px-1 py-0.2 text-[9px] font-mono">
                <span>100%</span>
                <span className="material-icons text-[12px] text-green-400">battery_full</span>
              </div>
            </div>
          </div>

          {/* SCREEN DISPLAY AREA */}
          <main className="w-full flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 text-slate-900 relative rounded-b-[36px] flex flex-col scroll-smooth">
            {children}

            {/* MOBILE QUICK NAVIGATION BOTTOM DOCK */}
            {onNavigate && (
              <nav className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around z-40 shadow-lg text-[10px] font-bold text-slate-600">
                <button
                  onClick={() => onNavigate('welcome')}
                  className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
                    currentView === 'welcome' && viewMode === 'single' ? 'text-indigo-600 bg-indigo-50' : 'hover:text-indigo-600'
                  }`}
                >
                  <span className="material-icons text-base">home</span>
                  <span>Setup</span>
                </button>
                <button
                  onClick={() => onNavigate('assessment')}
                  className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
                    currentView === 'assessment' && viewMode === 'single' ? 'text-indigo-600 bg-indigo-50' : 'hover:text-indigo-600'
                  }`}
                >
                  <span className="material-icons text-base">assignment</span>
                  <span>Inspect</span>
                </button>
                <button
                  onClick={() => onNavigate('drawings')}
                  className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
                    currentView === 'drawings' && viewMode === 'single' ? 'text-indigo-600 bg-indigo-50' : 'hover:text-indigo-600'
                  }`}
                >
                  <span className="material-icons text-base">architecture</span>
                  <span>Drawings</span>
                </button>
                <button
                  onClick={() => onNavigate('ai-agent-os')}
                  className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
                    currentView === 'ai-agent-os' && viewMode === 'single' ? 'text-indigo-600 bg-indigo-50' : 'hover:text-indigo-600'
                  }`}
                >
                  <span className="material-icons text-base">psychology</span>
                  <span>Agent OS</span>
                </button>
                <button
                  onClick={() => onNavigate('health-dashboard')}
                  className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
                    currentView === 'health-dashboard' && viewMode === 'single' ? 'text-indigo-600 bg-indigo-50' : 'hover:text-indigo-600'
                  }`}
                >
                  <span className="material-icons text-base">monitor_heart</span>
                  <span>Health</span>
                </button>
                <button
                  onClick={() => onNavigate('summary')}
                  className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
                    currentView === 'summary' && viewMode === 'single' ? 'text-indigo-600 bg-indigo-50' : 'hover:text-indigo-600'
                  }`}
                >
                  <span className="material-icons text-base">assessment</span>
                  <span>Summary</span>
                </button>
                {onTogglePortfolio && (
                  <button
                    onClick={onTogglePortfolio}
                    className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
                      viewMode === 'portfolio' ? 'text-purple-600 bg-purple-50' : 'hover:text-purple-600'
                    }`}
                  >
                    <span className="material-icons text-base">dashboard</span>
                    <span>Portfolio</span>
                  </button>
                )}
              </nav>
            )}

            {/* HOME INDICATOR BAR */}
            <div className="w-full flex justify-center py-1 bg-white/80 shrink-0">
              <div className="w-28 h-1 bg-slate-400/80 rounded-full"></div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
