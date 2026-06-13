import {
  createContext,
  useState,
  ReactNode,
  useContext,
  useMemo,
} from 'react';

export interface ClaudeUsageData {
  five_h: number;
  seven_d: number;
  seven_d_s: number;
  five_h_reset_kst: string;
}

interface ClaudeUsageContextType {
  usage: ClaudeUsageData | null;
  setUsage: (data: ClaudeUsageData) => void;
}

export const ClaudeUsageContext = createContext<ClaudeUsageContextType>({
  usage: null,
  setUsage: () => {},
});

export function ClaudeUsageProvider({ children }: { children: ReactNode }) {
  const [usage, setUsage] = useState<ClaudeUsageData | null>(null);

  const value = useMemo(() => ({ usage, setUsage }), [usage]);

  return (
    <ClaudeUsageContext.Provider value={value}>
      {children}
    </ClaudeUsageContext.Provider>
  );
}

export function useClaudeUsage() {
  return useContext(ClaudeUsageContext);
}
