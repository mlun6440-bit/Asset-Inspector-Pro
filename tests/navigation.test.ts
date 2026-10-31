import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmartRoomFinder } from '../components/SmartRoomFinder';
import { getGoogleMapsApiKey, setCustomGoogleMapsApiKey } from '../services/googleMapsService';

afterEach(() => { cleanup(); localStorage.clear(); });

// Synthetic rooms only — no real site data
const rooms = [
  { id: 'r-ext', roomName: 'Building Exterior', buildingName: 'Synthetic Block A', floorLevel: 'G', images: [], assets: [] },
  { id: 'r-office', roomName: 'Office 12', roomCode: 'A-1.12', buildingName: 'Synthetic Block A', floorLevel: 'L1', images: [], assets: [] },
  { id: 'r-plant', roomName: 'Plant Room', roomCode: 'A-R.01', buildingName: 'Synthetic Block A', floorLevel: 'Roof', images: [], assets: [] },
] as any;

describe('Smart Room Finder', () => {
  function renderFinder(onSelect = vi.fn()) {
    render(React.createElement(SmartRoomFinder, { rooms, onSelect, onClose: vi.fn() }));
    return onSelect;
  }
  it('filters by floor and returns the original room index', () => {
    const onSelect = renderFinder();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Roof' } });
    expect(screen.getByText('1 candidate room(s). Confirm the correct room manually.')).toBeTruthy();
    fireEvent.click(screen.getByText('Plant Room').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });
  it('searches by room code and by name', () => {
    const onSelect = renderFinder();
    const search = screen.getByPlaceholderText('e.g. Office 12');
    fireEvent.change(search, { target: { value: 'a-1.12' } });
    fireEvent.click(screen.getByText('Office 12').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.change(search, { target: { value: 'nonexistent' } });
    expect(screen.getByText(/No matching existing rooms/)).toBeTruthy();
  });
  it('never changes the rooms it is given', () => {
    const before = JSON.stringify(rooms);
    renderFinder();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'L1' } });
    expect(JSON.stringify(rooms)).toBe(before);
  });
});

describe('Google Maps key source', () => {
  // No VITE_GOOGLE_MAPS_API_KEY in the test environment, so the saved key is used
  it('uses the saved key when no environment key is set, and clearing it removes it', () => {
    setCustomGoogleMapsApiKey(' saved-key ');
    expect(getGoogleMapsApiKey()).toBe('saved-key');
    setCustomGoogleMapsApiKey('');
    expect(getGoogleMapsApiKey()).toBe('');
  });
});
