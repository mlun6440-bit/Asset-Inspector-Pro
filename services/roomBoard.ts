import { Room } from '../types';

export const UNRECORDED_LEVEL = 'Level not recorded';

export interface RoomBoardCard {
  room: Room;
  /** Position in the site's room list — what navigation uses. Never a new ID. */
  index: number;
  photoCount: number;
  assetCount: number;
  needsReviewCount: number;
}

export interface RoomBoardGroup {
  level: string;
  cards: RoomBoardCard[];
}

export interface RoomBoardFilter {
  level?: string;
  query?: string;
  missingPhotosOnly?: boolean;
}

/** Distinct recorded levels, naturally sorted (B1, G, L1, L2, L10, Roof). */
export function roomLevels(rooms: Room[]): string[] {
  const levels = new Set(rooms.map(r => (r.floorLevel || '').trim()).filter(Boolean));
  return [...levels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Groups a site's rooms by level for the photo board. Rooms keep their original order within a
 * level; rooms with no level go in a final "Level not recorded" group. Read-only: rooms are
 * never modified.
 */
export function buildRoomBoard(rooms: Room[], filter: RoomBoardFilter = {}): RoomBoardGroup[] {
  const query = (filter.query || '').trim().toLowerCase();
  const cards: RoomBoardCard[] = rooms
    .map((room, index) => ({
      room,
      index,
      photoCount: room.images?.length || 0,
      assetCount: room.assets?.length || 0,
      needsReviewCount: (room.assets || []).filter(a => a.aiDetected && !a.verified).length,
    }))
    .filter(({ room }) => !filter.level || (room.floorLevel || '').trim() === filter.level
      || (filter.level === UNRECORDED_LEVEL && !(room.floorLevel || '').trim()))
    .filter(({ photoCount }) => !filter.missingPhotosOnly || photoCount === 0)
    .filter(({ room }) => !query || [room.roomName, room.roomCode, room.roomType, room.floorLevel, room.buildingName]
      .some(v => (v || '').toLowerCase().includes(query)));

  const groups = new Map<string, RoomBoardCard[]>();
  for (const level of [...roomLevels(rooms), UNRECORDED_LEVEL]) groups.set(level, []);
  for (const card of cards) groups.get((card.room.floorLevel || '').trim() || UNRECORDED_LEVEL)!.push(card);
  return [...groups.entries()].filter(([, list]) => list.length > 0).map(([level, list]) => ({ level, cards: list }));
}
