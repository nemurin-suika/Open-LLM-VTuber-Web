/* eslint-disable react/jsx-no-constructed-context-values */
import {
  createContext, useContext, useState, useCallback, useMemo,
} from 'react';

/**
 * 세션 하나 = letta conversation 하나 (TODO19 2단계)
 *
 * letta Conversation 스키마에는 name/title 필드가 없어 summary 안에
 * {"n": 이름, "g": 한 줄 요약} 을 JSON 으로 담고, 백엔드가 name/gist 로 풀어서 보낸다.
 * id === 'default' 는 기존 단일 대화를 가리키는 가상 세션이며 삭제할 수 없다.
 */
export interface SessionInfo {
  id: string;
  /** 하위호환용. 백엔드가 name 과 같은 값을 넣어준다 */
  summary: string;
  /** 사용자가 정한 세션 이름 */
  name?: string;
  /** 미즈키가 남긴 최근 대화 한 줄 요약 */
  gist?: string;
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
  /**
   * 세션별 미확인 발화 덩어리 개수 (TODO19 7단계)
   *
   * 세는 대상은 미즈키 대사 턴만이고 중간 알림은 세지 않는다(네무린 선택).
   * 개수를 모르는 미확인(= 알림만 올라온 상태)은 여기에 키가 없고 unreadIds 에만 들어간다.
   */
  unreadCounts: Record<string, number>;
  /** 지금 미즈키가 작업 중인(LLM 또는 TTS 진행 중) 세션 id 목록 */
  runningIds: string[];
  setSessions: (list: SessionInfo[]) => void;
  setActiveSessionId: (id: string) => void;
  setSupported: (value: boolean) => void;
  markUnread: (id: string, count?: number) => void;
  clearUnread: (id: string) => void;
  setUnreadIds: (ids: string[]) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
  setRunningIds: (ids: string[]) => void;
  markRunning: (id: string) => void;
  clearRunning: (id: string) => void;
  /** 미즈키가 턴 끝에 보내온 한 줄 요약을 해당 세션에 반영 */
  updateSessionGist: (id: string, gist: string) => void;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('default');
  const [supported, setSupported] = useState<boolean>(false);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [runningIds, setRunningIds] = useState<string[]>([]);

  const markUnread = useCallback((id: string, count?: number) => {
    if (!id) return;
    setUnreadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (typeof count === 'number' && count > 0) {
      setUnreadCounts((prev) => (prev[id] === count ? prev : { ...prev, [id]: count }));
    }
  }, []);

  const clearUnread = useCallback((id: string) => {
    setUnreadIds((prev) => prev.filter((x) => x !== id));
    setUnreadCounts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const markRunning = useCallback((id: string) => {
    if (!id) return;
    setRunningIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const clearRunning = useCallback((id: string) => {
    setRunningIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const updateSessionGist = useCallback((id: string, gist: string) => {
    if (!id) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, gist } : s)));
  }, []);

  const value = useMemo<SessionState>(() => ({
    sessions,
    activeSessionId,
    supported,
    unreadIds,
    unreadCounts,
    runningIds,
    setSessions,
    setActiveSessionId,
    setSupported,
    markUnread,
    clearUnread,
    setUnreadIds,
    setUnreadCounts,
    setRunningIds,
    markRunning,
    clearRunning,
    updateSessionGist,
  }), [
    sessions, activeSessionId, supported, unreadIds, unreadCounts, runningIds,
    markUnread, clearUnread, markRunning, clearRunning, updateSessionGist,
  ]);

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
