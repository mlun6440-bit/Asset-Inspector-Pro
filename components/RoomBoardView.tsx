import React, { useMemo, useState } from 'react';
import { Camera, Images, Search, ShieldAlert } from 'lucide-react';
import { Room } from '../types';
import { buildRoomBoard, roomLevels, UNRECORDED_LEVEL } from '../services/roomBoard';

interface RoomBoardViewProps {
  siteName: string;
  rooms: Room[];
  onOpenRoom: (index: number) => void;
  onPreviewImage: (dataUrl: string) => void;
}

/**
 * Site-wide visual room list: every recorded room/area as a card with its photos, level, room
 * code and name, grouped by level. Overcomes the one-line, no-thumbnail room list in Fulcrum —
 * you can see each room's photos without opening it, and enlarge any photo with one tap.
 */
export const RoomBoardView: React.FC<RoomBoardViewProps> = ({ siteName, rooms, onOpenRoom, onPreviewImage }) => {
  const [level, setLevel] = useState('');
  const [query, setQuery] = useState('');
  const [missingPhotosOnly, setMissingPhotosOnly] = useState(false);

  const levels = useMemo(() => roomLevels(rooms), [rooms]);
  const hasUnrecordedLevel = rooms.some(r => !(r.floorLevel || '').trim());
  const groups = useMemo(() => buildRoomBoard(rooms, { level, query, missingPhotosOnly }), [rooms, level, query, missingPhotosOnly]);
  const shownCount = groups.reduce((n, g) => n + g.cards.length, 0);
  const withoutPhotos = rooms.filter(r => (r.images?.length || 0) === 0).length;

  return (
    <div className="space-y-5 text-left">
      <div className="bg-white rounded-xl shadow-md p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Images className="w-5 h-5 text-indigo-600" /> Room Board</h2>
            <p className="text-sm text-gray-600">{siteName || 'Current site'} · {rooms.length} rooms/areas · {rooms.length - withoutPhotos} photographed · {withoutPhotos} without photos</p>
          </div>
          <p className="text-xs text-gray-500">Tap a photo to enlarge it. Tap “Open room” to inspect.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Level
            <select aria-label="Filter by level" value={level} onChange={e => setLevel(e.target.value)}
              className="mt-1 block w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm font-normal normal-case text-black">
              <option value="">All levels</option>
              {levels.map(l => <option key={l} value={l}>{l}</option>)}
              {hasUnrecordedLevel && <option value={UNRECORDED_LEVEL}>{UNRECORDED_LEVEL}</option>}
            </select>
          </label>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Search
            <span className="mt-1 flex items-center gap-2 rounded-lg border bg-gray-50 px-3">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Room name, code or type"
                className="w-full bg-transparent py-2 text-sm font-normal normal-case text-black outline-none" />
            </span>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input type="checkbox" checked={missingPhotosOnly} onChange={e => setMissingPhotosOnly(e.target.checked)} />
            Only rooms without photos
          </label>
        </div>
        {levels.length === 0 && rooms.length > 0 && (
          <p className="text-xs text-amber-700">No levels recorded yet. Add a Level on each room’s Room Information panel to group rooms by floor.</p>
        )}
      </div>

      <p className="inline-block rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-gray-700 shadow-sm">{shownCount} room(s) shown</p>
      {groups.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-gray-600 shadow-sm">No rooms match these filters.</p>}

      {groups.map(group => (
        <section key={group.level} aria-label={group.level} className="space-y-3">
          <h3 className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-indigo-700 shadow-sm">
            {group.level} <span className="font-semibold normal-case text-gray-500">{group.cards.length} room{group.cards.length === 1 ? '' : 's'}</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {group.cards.map(({ room, index, photoCount, assetCount, needsReviewCount }) => {
              const [cover, ...rest] = room.images || [];
              return (
                <article key={room.id} className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col">
                  {cover ? (
                    <button type="button" onClick={() => onPreviewImage(cover.dataUrl)} className="relative block h-40 w-full bg-gray-100"
                      aria-label={`Enlarge photo of ${room.roomName || 'room'}`}>
                      <img src={cover.dataUrl} alt={`${room.roomName || 'Room'} photo 1`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{photoCount} photo{photoCount === 1 ? '' : 's'}</span>
                    </button>
                  ) : (
                    <div className="flex h-40 flex-col items-center justify-center gap-1 bg-gray-100 text-sm text-gray-500">
                      <Camera className="w-6 h-6" /> No photo yet
                    </div>
                  )}
                  {rest.length > 0 && (
                    <div className="flex gap-1 px-2 pt-2">
                      {rest.slice(0, 4).map((img, i) => (
                        <button key={img.id} type="button" onClick={() => onPreviewImage(img.dataUrl)} className="h-12 w-12 overflow-hidden rounded bg-gray-100"
                          aria-label={`Enlarge photo ${i + 2} of ${room.roomName || 'room'}`}>
                          <img src={img.dataUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        </button>
                      ))}
                      {rest.length > 4 && <span className="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-600">+{rest.length - 4}</span>}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">{(room.floorLevel || '').trim() || 'No level'}</span>
                      {room.roomCode && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{room.roomCode}</span>}
                      {room.roomType && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{room.roomType}</span>}
                    </div>
                    <div className="font-bold text-gray-900">{room.roomName || `Room ${index + 1}`}</div>
                    <div className="text-xs text-gray-600">
                      {assetCount} asset{assetCount === 1 ? '' : 's'}
                      {needsReviewCount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-amber-700"><ShieldAlert className="w-3 h-3" />{needsReviewCount} need review</span>
                      )}
                    </div>
                    <button type="button" onClick={() => onOpenRoom(index)}
                      className="mt-auto self-start rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                      Open room
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
