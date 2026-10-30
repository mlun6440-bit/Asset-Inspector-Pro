import React, { useMemo, useState } from 'react';
import { Camera, Search, X } from 'lucide-react';
import type { Room } from '../types';

/** Phase 1: explicit, human-confirmed room lookup. No AI image recognition yet. */
export function SmartRoomFinder({ rooms, onSelect, onClose }: {
  rooms: Room[];
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const [floor, setFloor] = useState('');
  const [query, setQuery] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const floors = useMemo(() => [...new Set(rooms.map(r => r.floorLevel).filter((x): x is string => Boolean(x)))].sort(), [rooms]);
  const candidates = useMemo(() => rooms.map((room, index) => ({ room, index }))
    .filter(({ room }) => !floor || room.floorLevel === floor)
    .filter(({ room }) => !query || [room.roomName, room.roomCode, room.buildingName].some(v => (v || '').toLowerCase().includes(query.toLowerCase()))), [rooms, floor, query]);
  const onPhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Smart Room Finder" className="fixed inset-0 z-50 bg-slate-950/70 p-4 overflow-auto">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-xl space-y-5">
        <div className="flex justify-between items-center">
          <div><h2 className="text-xl font-bold">Smart Room Finder</h2><p className="text-sm text-slate-600">Phase 1 — manual candidate lookup; visual recognition is not yet enabled.</p></div>
          <button onClick={onClose} aria-label="Close Smart Room Finder"><X /></button>
        </div>
        <label className="block text-sm font-semibold">Which floor are you on?
          <select value={floor} onChange={e => setFloor(e.target.value)} className="mt-1 block w-full rounded-lg border p-3">
            <option value="">All floors / floor not recorded</option>
            {floors.map(level => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        {floors.length === 0 && <p className="text-sm text-amber-700">Existing rooms have no floor metadata yet. Add floor levels to enable floor filtering.</p>}
        <label className="block text-sm font-semibold">Capture this room (optional reference only)
          <span className="mt-1 flex items-center gap-2 rounded-lg border p-3"><Camera size={18} /> Take or choose a photograph</span>
          <input type="file" accept="image/*" capture="environment" onChange={e => onPhoto(e.target.files?.[0])} className="mt-2 block w-full text-sm" />
        </label>
        {photo && <div><img src={photo} alt="Current room photograph" className="max-h-40 rounded-lg object-contain" /><p className="text-xs text-slate-500">{fileName} — not used for matching in Phase 1</p></div>}
        <label className="block text-sm font-semibold">Search by room name, code or building
          <span className="mt-1 flex items-center gap-2 rounded-lg border px-3"><Search size={18} /><input className="w-full p-3 outline-none" value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Office 12" /></span>
        </label>
        <p className="text-sm text-slate-600">{candidates.length} candidate room(s). Confirm the correct room manually.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {candidates.map(({ room, index }) => <button key={room.id} type="button" onClick={() => onSelect(index)} className="rounded-xl border p-3 text-left hover:border-indigo-600 focus-visible:outline focus-visible:outline-indigo-600">
            {room.images[0]?.dataUrl ? <img src={room.images[0].dataUrl} alt={`Historical reference for ${room.roomName}`} className="h-32 w-full rounded-lg object-cover" /> : <div className="flex h-32 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">No historical photograph</div>}
            <div className="mt-2 font-bold">{room.roomName || 'Unnamed room'}</div>
            <div className="text-sm text-slate-600">{room.buildingName}{room.floorLevel ? ` · ${room.floorLevel}` : ''}{room.roomCode ? ` · ${room.roomCode}` : ''}</div>
            <div className="text-xs text-indigo-700 mt-2">Open existing inspection record</div>
          </button>)}
        </div>
        {!candidates.length && <p className="text-sm">No matching existing rooms. Try clearing the filters.</p>}
      </div>
    </div>
  );
}
