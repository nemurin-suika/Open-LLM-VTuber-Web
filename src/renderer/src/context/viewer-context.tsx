import {
  createContext, useContext, useMemo, useState,
} from 'react';

/**
 * 지금 이 브라우저로 접속한 사람의 신원 (TODO2 1-10 멀티유저).
 * 백엔드 set-model-and-conf 메시지의 viewer 필드로 내려온다.
 * 값이 아직 안 왔을 때는 손님으로 가정해서 주인 전용 UI 를 숨긴다.
 */
export interface ViewerInfo {
  email: string;
  name: string;
  role: string;
  service: string;
  local: boolean;
  is_owner: boolean;
  label: string;
}

interface ViewerState {
  viewer: ViewerInfo | null;
  setViewer: (viewer: ViewerInfo | null) => void;
  isOwnerViewer: boolean;
}

const ViewerContext = createContext<ViewerState | null>(null);

export function ViewerProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [viewer, setViewer] = useState<ViewerInfo | null>(null);
  const value = useMemo(
    () => ({ viewer, setViewer, isOwnerViewer: viewer?.is_owner === true }),
    [viewer],
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerState {
  const context = useContext(ViewerContext);
  if (!context) throw new Error('useViewer must be used within ViewerProvider');
  return context;
}
