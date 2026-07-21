import { Room } from './types';

export const ASSET_CATEGORIES = [
    // --- BUILDING FABRIC ---
    "Building Structural & Fabric,Walls",
    "Building Structural & Fabric,Paintwork",
    "Building Structural & Fabric,Roofing",
    "Building Structural & Fabric,Guttering",
    "Building Structural & Fabric,Flooring",
    "Building Structural & Fabric,Facade",
    "Building Structural & Fabric,Ceiling",
    "Building Structural & Fabric,Windows",
    "Building Structural & Fabric,Window Shades & Furnishings", // Blinds (Fixed)
    "Building Structural & Fabric,Stairs & Ramps",
    "Building Structural & Fabric,Security Barriers & Structures",
    "Building Structural & Fabric,Roller Doors",
    "Building Structural & Fabric,Height Safety",
    "Building Structural & Fabric,Fire/Smoke/Exit Door",
    "Building Structural & Fabric,Doors & Door Hardware",
    "Building Structural & Fabric,Disabled Access",
    "Building Structural & Fabric,Automatic Doors",
    "Building Structural & Fabric,Signage & Livery (Non-Powered)",
    "Building Structural & Fabric,Signage & Livery (Powered)",

    // --- ELECTRICAL SERVICES ---
    "Electrical Systems,Switchgear",
    "Electrical Systems,Main Switchboard",
    "Electrical Systems,Distribution Board",
    "Electrical Systems,Lighting",
    "Electrical Systems,Emergency & Exit Lighting",
    "Electrical Systems,Electrical Switches & Outlets",
    "Electrical Systems,Electrical Distribution",
    "Electrical Systems,Solar Power",
    "Electrical Systems,UPS",
    "Electrical Systems,Power Factor Correction",
    "Electrical Systems,Lightning Protection",
    "Electrical Systems,Emergency Power Generation",
    "Electrical Systems,Electricity Meter",
    "Electrical Systems,Electrical Transformer",
    
    // --- HVAC & MECHANICAL ---
    "HVAC & Refrigeration,Air Handling Units",
    "HVAC & Refrigeration,Split AC",
    "HVAC & Refrigeration,Ducted AC",
    "HVAC & Refrigeration,VRV System",
    "HVAC & Refrigeration,Chillers",
    "HVAC & Refrigeration,Cooling Towers",
    "HVAC & Refrigeration,Boilers",
    "HVAC & Refrigeration,Fans",
    "HVAC & Refrigeration,Ductwork",
    "HVAC & Refrigeration,Diffusers & Grilles",
    "HVAC & Refrigeration,HVAC Control / BMS",
    "HVAC & Refrigeration,Heaters",
    "HVAC & Refrigeration,Pumps",
    "HVAC & Refrigeration,Fire Dampers",

    // --- PLUMBING ---
    "Plumbing Systems,Toilets & Urinals",
    "Plumbing Systems,Sinks & Basins",
    "Plumbing Systems,Taps & Mixers",
    "Plumbing Systems,Showers",
    "Plumbing Systems,Hot Water Service",
    "Plumbing Systems,Water Tanks",
    "Plumbing Systems,Pumps",
    "Plumbing Systems,Valves & Backflow Prevention",
    "Plumbing Systems,Stormwater Drains",
    "Plumbing Systems,Floor Wastes",
    "Plumbing Systems,Sewage System",
    "Plumbing Systems,Water Meter",
    "Plumbing Systems,Fire Hydrants & Hose Reels",
    "Plumbing Systems,Sprinkler System",

    // --- FIRE & SAFETY ---
    "Fire Systems,Fire Detection (Smoke/Thermal)",
    "Fire Systems,Fire Alarm Panel (FIP)",
    "Fire Systems,EWIS (Warning System)",
    "Fire Systems,Fire Extinguishers",
    "Fire Systems,Fire Blankets",
    "Fire Systems,Gas Suppression System",

    // --- SECURITY & TRANSPORT ---
    "Security Systems,CCTV Cameras",
    "Security Systems,Access Control Readers",
    "Security Systems,Security Alarm Sensors",
    "Transportation Systems,Lifts / Elevators",
    "Transportation Systems,Escalators",
    
    // --- GROUNDS (STRUCTURAL) ---
    "Grounds & Gardens,Roads & Driveways",
    "Grounds & Gardens,Pathways & Paving",
    "Grounds & Gardens,Fences & Gates",
    "Grounds & Gardens,Retaining Walls",
    "Grounds & Gardens,Car Park Linemarking"
];

export const CONDITION_OPTIONS = ['Excellent', 'Good', 'Average', 'Fair', 'Poor'];
export const RISK_OPTIONS = ['Low', 'Medium', 'High', 'Extreme'];
export const RISK_COLORS: Record<string, string> = {
  Low: '#10B981',       // Green
  Medium: '#EAB308',    // Yellow
  High: '#F97316',      // Orange
  Extreme: '#DC2626'    // Red
};

export const INITIAL_ROOM_STATE: Room = {
  id: '',
  buildingName: '',
  roomName: '',
  images: [],
  assets: [],
  croppedImages: {},
  comments: ''
};
