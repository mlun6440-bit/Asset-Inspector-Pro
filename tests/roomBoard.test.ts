import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRoomBoard, roomLevels, UNRECORDED_LEVEL } from '../services/roomBoard';
import { RoomBoardView } from '../components/RoomBoardView';

afterEach(cleanup);

// Synthetic rooms and 1x1 synthetic images only
const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const img = (id: string) => ({ id, dataUrl: `${px}#${id}` });
const rooms = [
  { id: 'r1', roomName: 'Office 2', roomCode: 'A-2.01', floorLevel: 'L2', images: [img('a'), img('b')], assets: [{ id: 'x', aiDetected: true, verified: false }] },
  { id: 'r2', roomName: 'Foyer', roomCode: 'A-G.01', roomType: 'Front of House', floorLevel: 'G', images: [img('c')], assets: [] },
  { id: 'r3', roomName: 'Plant', floorLevel: 'L10', images: [], assets: [] },
  { id: 'r4', roomName: 'Store', images: [], assets: [{ id: 'y', aiDetected: true, verified: true }] },
  { id: 'r5', roomName: 'Office 1', roomCode: 'A-2.02', floorLevel: 'L2', images: [], assets: [] },
] as any;

describe('room board grouping', () => {
  it('groups by level in natural order, unrecorded last, keeping original indexes', () => {
    const groups = buildRoomBoard(rooms);
    expect(groups.map(g => g.level)).toEqual(['G', 'L2', 'L10', UNRECORDED_LEVEL]);
    expect(groups[1].cards.map(c => [c.room.id, c.index])).toEqual([['r1', 0], ['r5', 4]]);
    expect(roomLevels(rooms)).toEqual(['G', 'L2', 'L10']);
  });
  it('counts photos and unreviewed AI assets', () => {
    const card = buildRoomBoard(rooms)[1].cards[0];
    expect(card).toMatchObject({ photoCount: 2, assetCount: 1, needsReviewCount: 1 });
  });
  it('filters by level, search and missing photos without changing rooms', () => {
    const before = JSON.stringify(rooms);
    expect(buildRoomBoard(rooms, { level: UNRECORDED_LEVEL }).flatMap(g => g.cards.map(c => c.room.id))).toEqual(['r4']);
    expect(buildRoomBoard(rooms, { query: 'a-g.01' }).flatMap(g => g.cards.map(c => c.room.id))).toEqual(['r2']);
    expect(buildRoomBoard(rooms, { query: 'front of house' }).flatMap(g => g.cards.map(c => c.room.id))).toEqual(['r2']);
    expect(buildRoomBoard(rooms, { missingPhotosOnly: true }).flatMap(g => g.cards.map(c => c.room.id))).toEqual(['r5', 'r3', 'r4']);
    expect(JSON.stringify(rooms)).toBe(before);
  });
});

describe('RoomBoardView', () => {
  it('shows each room as a card with thumbnail, level, code and name', () => {
    const onOpenRoom = vi.fn();
    const onPreviewImage = vi.fn();
    render(React.createElement(RoomBoardView, { siteName: 'Synthetic Site', rooms, onOpenRoom, onPreviewImage }));
    const level2 = screen.getByRole('region', { name: 'L2' });
    const office = within(level2).getByText('Office 2').closest('article')!;
    expect(within(office).getByText('A-2.01')).toBeTruthy();
    expect(within(office).getByText('2 photos')).toBeTruthy();
    expect(within(office).getByText('1 need review')).toBeTruthy();

    fireEvent.click(within(office).getByLabelText('Enlarge photo of Office 2'));
    expect(onPreviewImage).toHaveBeenCalledWith(`${px}#a`);
    fireEvent.click(within(office).getByLabelText('Enlarge photo 2 of Office 2'));
    expect(onPreviewImage).toHaveBeenCalledWith(`${px}#b`);
    fireEvent.click(within(office).getByText('Open room'));
    expect(onOpenRoom).toHaveBeenCalledWith(0);

    expect(within(screen.getByRole('region', { name: 'L10' })).getByText('No photo yet')).toBeTruthy();
  });
  it('filters by level from the dropdown', () => {
    render(React.createElement(RoomBoardView, { siteName: 'Synthetic Site', rooms, onOpenRoom: vi.fn(), onPreviewImage: vi.fn() }));
    fireEvent.change(screen.getByLabelText('Filter by level'), { target: { value: 'G' } });
    expect(screen.getByText('1 room(s) shown')).toBeTruthy();
    expect(screen.queryByText('Office 2')).toBeNull();
  });
});
