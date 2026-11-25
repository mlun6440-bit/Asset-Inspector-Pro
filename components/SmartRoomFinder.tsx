import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Search, Trash2, X } from 'lucide-react';
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
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const safeRooms = Array.isArray(rooms) ? rooms : [];

  const floors = useMemo(
    () => [...new Set(safeRooms.map(r => r.floorLevel).filter((x): x is string => Boolean(x)))].sort(),
    [safeRooms]
  );

  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return safeRooms
      .map((room, index) => ({ room, index }))
      .filter(({ room }) => !floor || room.floorLevel === floor)
      .filter(({ room }) =>
        !normalizedQuery ||
        [room.roomName, room.roomCode, room.buildingName, room.floorLevel, room.fulcrumRoomId]
          .some(v => (v || '').toLowerCase().includes(normalizedQuery))
      );
  }, [safeRooms, floor, query]);

  const onPhoto = (file?: File) => {
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select a valid image file.');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => setPhotoError('Could not read the selected image file.');
    reader.readAsDataURL(file);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Smart Room Finder"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="mx-auto max-w-3xl rounded-2xl bg-white text-slate-900 p-6 shadow-xl space-y-5 my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Smart Room Finder</h2>
            <p className="text-sm text-slate-600">
              Phase 1 — manual candidate lookup; visual recognition is not yet enabled.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Smart Room Finder"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-sm font-semibold text-slate-800">
          Which floor are you on?
          <select
            value={floor}
            onChange={e => setFloor(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm font-normal focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">All floors / floor not recorded</option>
            {floors.map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </label>

        {floors.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Existing rooms have no floor metadata yet. Add floor levels to enable floor filtering.
          </p>
        )}

        <label className="block text-sm font-semibold text-slate-800">
          Capture this room (optional reference only)
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 p-3 text-slate-700 hover:bg-slate-50 cursor-pointer">
            <Camera size={18} /> Take or choose a photograph
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => onPhoto(e.target.files?.[0])}
            className="mt-2 block w-full text-sm text-slate-600"
          />
        </label>

        {photoError && (
          <p className="text-xs text-rose-600 font-medium">{photoError}</p>
        )}

        {photo && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <img
              src={photo}
              alt="Current room photograph"
              className="max-h-40 rounded-lg object-contain bg-slate-900/5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">{fileName}</p>
              <p className="text-xs text-slate-500 mt-0.5">Reference only — not used for matching in Phase 1</p>
              <button
                type="button"
                onClick={() => { setPhoto(null); setFileName(''); }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove photo
              </button>
            </div>
          </div>
        )}

        <label className="block text-sm font-semibold text-slate-800">
          Search by room name, code or building
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:ring-2 focus-within:ring-indigo-500">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input
              className="w-full py-3 outline-none text-sm font-normal"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Office 12, Plant Room, Level 2"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </span>
        </label>

        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{candidates.length} candidate room(s). Confirm the correct room manually.</span>
          {(floor || query) && (
            <button
              type="button"
              onClick={() => { setFloor(''); setQuery(''); }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {candidates.map(({ room, index }) => {
            const firstImage = room.images?.[0]?.dataUrl;
            const assetCount = room.assets?.length ?? 0;
            return (
              <button
                key={room.id || index}
                type="button"
                onClick={() => onSelect(index)}
                className="rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-600 hover:shadow-md focus-visible:outline focus-visible:outline-indigo-600 transition cursor-pointer"
              >
                {firstImage ? (
                  <img
                    src={firstImage}
                    alt={`Historical reference for ${room.roomName || 'room'}`}
                    className="h-32 w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
                    No historical photograph
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 truncate">{room.roomName || 'Unnamed room'}</div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                    {assetCount} {assetCount === 1 ? 'asset' : 'assets'}
                  </span>
                </div>
                <div className="text-sm text-slate-600 truncate">
                  {room.buildingName || 'Current Site'}
                  {room.floorLevel ? ` · ${room.floorLevel}` : ''}
                  {room.roomCode ? ` · ${room.roomCode}` : ''}
                </div>
                <div className="text-xs font-semibold text-indigo-700 mt-2">
                  Open existing inspection record →
                </div>
              </button>
            );
          })}
        </div>

        {!candidates.length && (
          <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
            No matching existing rooms. Try clearing the filters.
          </p>
        )}
      </div>
    </div>
  );
}
