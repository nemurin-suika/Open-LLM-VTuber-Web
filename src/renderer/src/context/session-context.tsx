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

/**
 * 작업 중 세션에 들어와 아직 전달되지 않은 사용자 입력 하나
 *
 * 미즈키가 그 세션에서 턴을 돌고 있는 동안 보낸 입력은 백엔드가 세션별 큐에 쌓고
 * 현재 턴이 끝나는 즉시 이어서 처리한다. 프론트는 session-queue 스냅샷으로만
 * 이 목록을 알 수 있고, 최종 상태는 항상 서버 스냅샷을 따른다.
 */
export interface QueuedInput {
  id: string;
  /** 사용자가 보낸 입력 원문 */
  text: string;
  /** 큐에 들어간 시각 (epoch 초, 소수점 포함) */
  ts: number;
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
  /**
   * 세션별 전달 대기 중인 사용자 입력 목록 (작업 중 세션의 입력 큐잉)
   *
   * 값은 서버가 보내준 session-queue 스냅샷 그대로이고, 빈 큐는 키를 지운다.
   */
  queuedInputs: Record<string, QueuedInput[]>;
  /**
   * 세션별 대기 건수
   *
   * 지금 보고 있지 않은 세션은 항목 원문 없이 개수만 알 수 있다
   * (session-list 의 queued_counts). 0 인 세션은 키가 없다.
   */
  queuedCounts: Record<string, number>;
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
  /** session-queue 스냅샷 반영. 빈 배열이면 그 세션 큐 상태를 지운다 */
  setSessionQueue: (id: string, items: QueuedInput[]) => void;
  /** 취소 전송 직후의 낙관적 제거 (최종 상태는 뒤따라오는 스냅샷이 결정) */
  removeQueuedInput: (id: string, itemId: string) => void;
  /** 세션 삭제 등으로 큐 상태 자체를 버릴 때 */
  clearSessionQueue: (id: string) => void;
  /**
   * session-list 의 queued_counts 로 개수 상태를 한 번에 동기화
   *
   * 스냅샷에 없는 세션은 큐가 빈 것이므로 들고 있던 항목 목록까지 버린다.
   */
  syncQueuedCounts: (counts: Record<string, number>) => void;
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
  const [queuedInputs, setQueuedInputs] = useState<Record<string, QueuedInput[]>>({});
  const [queuedCounts, setQueuedCounts] = useState<Record<string, number>>({});

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

  const clearSessionQueue = useCallback((id: string) => {
    if (!id) return;
    setQueuedInputs((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setQueuedCounts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setSessionQueue = useCallback((id: string, items: QueuedInput[]) => {
    if (!id) return;
    // 빈 스냅샷 = 큐가 비었다는 뜻 → 상태를 들고 있지 않는다.
    if (!items || items.length === 0) {
      clearSessionQueue(id);
      return;
    }
    const sorted = [...items].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    setQueuedInputs((prev) => ({ ...prev, [id]: sorted }));
    setQueuedCounts((prev) => (
      prev[id] === sorted.length ? prev : { ...prev, [id]: sorted.length }
    ));
  }, [clearSessionQueue]);

  const removeQueuedInput = useCallback((id: string, itemId: string) => {
    if (!id || !itemId) return;
    setQueuedInputs((prev) => {
      const items = prev[id];
      if (!items) return prev;
      const left = items.filter((item) => item.id !== itemId);
      if (left.length === items.length) return prev;
      const next = { ...prev };
      if (left.length === 0) delete next[id];
      else next[id] = left;
      return next;
    });
    setQueuedCounts((prev) => {
      const count = prev[id];
      if (typeof count !== 'number') return prev;
      const next = { ...prev };
      if (count <= 1) delete next[id];
      else next[id] = count - 1;
      return next;
    });
  }, []);

  const syncQueuedCounts = useCallback((counts: Record<string, number>) => {
    const cleaned: Record<string, number> = {};
    Object.entries(counts || {}).forEach(([sid, n]) => {
      if (typeof n === 'number' && n > 0) cleaned[sid] = n;
    });
    setQueuedCounts(cleaned);
    // 개수 스냅샷에서 빠진 세션은 큐가 비었다는 뜻 → 보관 중인 항목도 버린다.
    setQueuedInputs((prev) => {
      const stale = Object.keys(prev).filter((sid) => !(sid in cleaned));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      stale.forEach((sid) => delete next[sid]);
      return next;
    });
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
    queuedInputs,
    queuedCounts,
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
    setSessionQueue,
    removeQueuedInput,
    clearSessionQueue,
    syncQueuedCounts,
    updateSessionGist,
  }), [
    sessions, activeSessionId, supported, unreadIds, unreadCounts, runningIds,
    queuedInputs, queuedCounts,
    markUnread, clearUnread, markRunning, clearRunning, updateSessionGist,
    setSessionQueue, removeQueuedInput, clearSessionQueue, syncQueuedCounts,
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
