import { useEffect, useReducer, useRef } from 'react';
import { Room, SiteInfo } from '../types';
import { firebaseService } from '../services/firebaseService';

// Request a save in the same event as a room update. The effect runs after React
// commits both updates, including when the functional state updater is deferred.
export function useRoomAutosave(siteInfo: SiteInfo, rooms: Room[]) {
  const [revision, requestSave] = useReducer((value: number) => value + 1, 0);
  const savedRevision = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (revision === savedRevision.current) return;
    savedRevision.current = revision;
    // Serialize room saves so a slow earlier save cannot replace newer edits.
    saveChain.current = saveChain.current
      .then(() => firebaseService.saveState(siteInfo, rooms))
      .catch(error => console.error('Room autosave failed:', error));
  }, [revision, siteInfo, rooms]);

  return requestSave;
}
