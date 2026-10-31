import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { firebaseService } from '../services/firebaseService';

export interface InspectorProfile {
  userId: string;
  name: string;
  email: string;
}

export interface UsePresenceSessionProps {
  currentInspectionId: string;
  effectiveIsOnline: boolean;
  viewMode: 'single' | 'portfolio';
  appView: string;
  inspectorProfile: InspectorProfile;
}

export function usePresenceSession({
  currentInspectionId,
  effectiveIsOnline,
  viewMode,
  appView,
  inspectorProfile,
}: UsePresenceSessionProps) {
  const [activePresences, setActivePresences] = useState<any[]>([]);
  const [hasEditLock, setHasEditLock] = useState<boolean>(true);
  // Start as a viewer; the first presence snapshot claims control if nobody else is editing
  const [isEditingPresence, setIsEditingPresenceState] = useState<boolean>(false);
  // Time of our latest edit claim; the most recent claim wins a conflict
  const editClaimedAtRef = useRef<number>(0);

  const setIsEditingPresence = useCallback((val: boolean) => {
    if (val) editClaimedAtRef.current = Date.now();
    setIsEditingPresenceState(val);
  }, []);

  const getAvatarColor = useCallback((str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'bg-pink-500 text-white',
      'bg-purple-500 text-white',
      'bg-blue-500 text-white',
      'bg-indigo-500 text-white',
      'bg-teal-500 text-white',
      'bg-emerald-500 text-white',
      'bg-amber-500 text-white',
      'bg-rose-500 text-white',
    ];
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }, []);

  const getInitials = useCallback((name: string, email: string) => {
    const text = name || email || 'Inspector';
    if (text.includes('@')) {
      return text.substring(0, 2).toUpperCase();
    }
    const parts = text.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return text.substring(0, 2).toUpperCase();
  }, []);

  useEffect(() => {
    if (!effectiveIsOnline || !currentInspectionId || viewMode !== 'single' || appView === 'welcome') {
      setActivePresences([]);
      setHasEditLock(true);
      return;
    }

    // 1. Immediately publish initial presence
    firebaseService.updatePresence(currentInspectionId, inspectorProfile.userId, inspectorProfile.email, isEditingPresence, editClaimedAtRef.current);

    // 2. Set up heartbeat timer (every 5 seconds)
    const heartbeat = setInterval(() => {
      firebaseService.updatePresence(currentInspectionId, inspectorProfile.userId, inspectorProfile.email, isEditingPresence, editClaimedAtRef.current);
    }, 5000);

    // 3. Listen to all presences on this site
    const unsubscribe = firebaseService.listenToPresence(currentInspectionId, (presences) => {
      const now = Date.now();
      // Filter out stale presences (> 15 seconds) and our own presence
      const activeOthers = presences.filter((p) => {
        if (p.userId === inspectorProfile.userId) return false;
        const lastActiveTime = p.lastActive ? new Date(p.lastActive).getTime() : 0;
        return now - lastActiveTime < 15000;
      });
      setActivePresences(activeOthers);

      // 4. Resolve edit lock conflicts deterministically: the most recent claim wins,
      // ties broken by userId, so exactly one editor keeps control
      const ourClaim = editClaimedAtRef.current;
      const outranksUs = (p: any) => {
        const theirClaim = Number(p.editClaimedAt) || 0;
        return theirClaim > ourClaim || (theirClaim === ourClaim && String(p.userId) > inspectorProfile.userId);
      };
      const otherEditors = activeOthers.filter((p) => p.isEditing);
      if (!isEditingPresence) {
        if (otherEditors.length === 0) {
          // Nobody else is editing any more; take control back
          setIsEditingPresence(true);
          setHasEditLock(true);
        } else {
          setHasEditLock(false);
        }
      } else if (otherEditors.some(outranksUs)) {
        setIsEditingPresenceState(false);
        setHasEditLock(false);
      } else {
        setHasEditLock(true);
      }
    });

    return () => {
      clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    };
  }, [currentInspectionId, effectiveIsOnline, viewMode, appView, inspectorProfile.userId, inspectorProfile.email, isEditingPresence, setIsEditingPresence]);

  const requestControl = useCallback(() => {
    setIsEditingPresence(true);
    setHasEditLock(true);
    if (currentInspectionId) {
      firebaseService.updatePresence(currentInspectionId, inspectorProfile.userId, inspectorProfile.email, true, editClaimedAtRef.current);
    }
  }, [currentInspectionId, inspectorProfile.userId, inspectorProfile.email, setIsEditingPresence]);

  return {
    activePresences,
    hasEditLock,
    setHasEditLock,
    isEditingPresence,
    setIsEditingPresence,
    requestControl,
    getAvatarColor,
    getInitials,
  };
}
