import React, { StrictMode, startTransition, useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { saveState } = vi.hoisted(() => ({ saveState: vi.fn(async () => {}) }));
vi.mock('../services/firebaseService', () => ({ firebaseService: { saveState } }));
import { useRoomAutosave } from '../hooks/useRoomAutosave';

afterEach(() => { cleanup(); saveState.mockReset().mockResolvedValue(undefined); });
const site = { name: 'Test' } as any;
let edit: (comment: string) => void;
function Harness() {
  const [rooms, setRooms] = useState<any[]>([{ id: 'room', comments: '' }]);
  const requestSave = useRoomAutosave(site, rooms);
  edit = comment => {
    startTransition(() => {
      setRooms(previous => [{ ...previous[0], comments: comment }]);
      requestSave();
    });
  };
  return React.createElement('div', null, rooms[0].comments);
}

describe('committed room autosave', () => {
  it('saves deferred updates once under StrictMode, without saving initial data', async () => {
    const screen = render(React.createElement(StrictMode, null, React.createElement(Harness)));
    expect(saveState).not.toHaveBeenCalled();
    await act(async () => { edit('new evidence'); });
    expect(screen.getByText('new evidence')).toBeTruthy();
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenLastCalledWith(site, [{ id: 'room', comments: 'new evidence' }]);
  });
  it('serializes successive saves so a slow first save cannot overwrite the second', async () => {
    let release!: () => void;
    saveState.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    render(React.createElement(Harness));
    await act(async () => { edit('first'); });
    await act(async () => { edit('second'); });
    expect(saveState).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    expect(saveState).toHaveBeenCalledTimes(2);
    expect(saveState).toHaveBeenLastCalledWith(site, [{ id: 'room', comments: 'second' }]);
  });
});
