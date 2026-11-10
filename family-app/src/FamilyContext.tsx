import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/auth/useAuth';
import type { CloudFrame, FamilyMember } from '@shared/types';

export interface FamilyContextValue {
  uid: string | null;
  familyId: string | null;
  displayName: string;
  frames: CloudFrame[];
  members: FamilyMember[];
  me: FamilyMember | null;
  isOwner: boolean;
  activeFrameId: string | null;
  setActiveFrameId: (id: string) => void;
  loading: boolean;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user, familyId } = useAuth();
  const [frames, setFrames] = useState<CloudFrame[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !familyId) {
      setFrames([]);
      return;
    }
    const q = query(collection(db, 'frames'), where('familyId', '==', familyId));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as CloudFrame);
      setFrames(list);
      setActiveFrameId((prev) => (prev && list.some((f) => f.frameId === prev) ? prev : (list[0]?.frameId ?? null)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  useEffect(() => {
    if (!db || !familyId) {
      setMembers([]);
      return;
    }
    return onSnapshot(collection(db, 'families', familyId, 'members'), (snap) => setMembers(snap.docs.map((d) => d.data() as FamilyMember)));
  }, [familyId]);

  const me = members.find((m) => m.uid === user?.uid) ?? null;

  const value = useMemo<FamilyContextValue>(
    () => ({
      uid: user?.uid ?? null,
      familyId,
      displayName: user?.displayName || user?.email || 'You',
      frames,
      members,
      me,
      isOwner: me?.role === 'OWNER',
      activeFrameId,
      setActiveFrameId,
      loading: false,
    }),
    [user, familyId, frames, members, me, activeFrameId],
  );

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily(): FamilyContextValue {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}

/** Doc reference helper used by several screens: void if there is no active frame yet. */
export function activeFrameDoc(frameId: string | null) {
  if (!db || !frameId) return null;
  return doc(db, 'frames', frameId);
}
