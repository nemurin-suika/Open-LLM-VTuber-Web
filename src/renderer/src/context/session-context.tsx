/* eslint-disable react/jsx-no-constructed-context-values */
import {
  createContext, useContext, useState, useCallback, useMemo,
} from 'react';

/**
 * 세션 하나 = letta conversation 하나 (TODO19 2단계)
 *
 * letta Conversation 스키마에는 name/title 필드가 없어 summary 를 제목으로 쓴다.
 * id === 'default' 는 기존 단일 대화를 가리키는 가상 세션이며 삭제할 수 없다.
 */
export interface SessionInfo {
  id: string;
  summary: string;
  created_at: string;
  last_message_at: string;
  is_default: boolean;
}

interface SessionState {
  sessions: SessionInfo[];
  activeSessionId: string;
  /** 백엔드 agent 가 다중 세션을 지원하는지 (letta 이외면 false → 레일 숨김) */
  supported: boolean;
  /** 비활성 세션에서 발화가 끝나 아직 열어보지 않은 세션 id 목록 */
  unreadIds: string[];
  setSessions: (list: SessionInfo[]) => void;
  setActiveSessionId: (id: string) => void;
  setSupported: (value: boolean) => void;
  markUnread: (id: string) => void;
  clearUnread: (id: string) => void;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('default');
  const [supported, setSupported] = useState<boolean>(false);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);

  const markUnread = useCallback((id: string) => {
    if (!id) return;
    setUnreadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const clearUnread = useCallback((id: string) => {
    setUnreadIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const value = useMemo<SessionState>(() => ({
    sessions,
    activeSessionId,
    supported,
    unreadIds,
    setSessions,
    setActiveSessionId,
    setSupported,
    markUnread,
    clearUnread,
  }), [sessions, activeSessionId, supported, unreadIds, markUnread, clearUnread]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
