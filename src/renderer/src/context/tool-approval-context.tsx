import { createContext, useContext, useMemo, useState } from 'react';

interface ToolApprovalState {
  allPass: boolean;
  setAllPass: (enabled: boolean) => void;
}

const ToolApprovalContext = createContext<ToolApprovalState | null>(null);

export function ToolApprovalProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [allPass, setAllPass] = useState(false);
  const value = useMemo(() => ({ allPass, setAllPass }), [allPass]);

  return <ToolApprovalContext.Provider value={value}>{children}</ToolApprovalContext.Provider>;
}

export function useToolApproval(): ToolApprovalState {
  const context = useContext(ToolApprovalContext);
  if (!context) throw new Error('useToolApproval must be used within ToolApprovalProvider');
  return context;
}
