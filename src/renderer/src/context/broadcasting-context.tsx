/* eslint-disable react/jsx-no-constructed-context-values */
import {
  createContext, useContext, useCallback, ReactNode,
} from 'react';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';

interface BroadcastingContextType {
  isBroadcasting: boolean;
  setIsBroadcasting: (v: boolean) => void;
}

const BroadcastingContext = createContext<BroadcastingContextType | null>(null);

export function BroadcastingProvider({ children }: { children: ReactNode }) {
  const [isBroadcasting, setStored] = useLocalStorage<boolean>('isBroadcasting', false);

  const setIsBroadcasting = useCallback((v: boolean) => setStored(v), [setStored]);

  return (
    <BroadcastingContext.Provider value={{ isBroadcasting, setIsBroadcasting }}>
      {children}
    </BroadcastingContext.Provider>
  );
}

export function useBroadcasting() {
  const ctx = useContext(BroadcastingContext);
  if (!ctx) throw new Error('useBroadcasting must be used within a BroadcastingProvider');
  return ctx;
}
