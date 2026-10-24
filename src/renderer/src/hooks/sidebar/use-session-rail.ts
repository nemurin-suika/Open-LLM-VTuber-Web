import { useCallback } from 'react';
import { useSession, SessionInfo } from '@/context/session-context';
import { useWebSocket } from '@/context/websocket-context';
import { useChatHistory } from '@/context/chat-history-context';

/**
 * 세션 레일 동작 (TODO19 2단계)
 *
 * 세션 전환은 두 단계로 나뉜다.
 *   1) switch-session  → 백엔드 LettaAgent 의 활성 conversation 교체
 *   2) fetch-letta-history(conversation_id) → 그 세션의 지난 대화 복원
 * 화면은 전환 즉시 비우고, 복원 결과가 도착하면 letta-history-data 핸들러가 채운다.
 */
export function useSessionRail() {
  const {
    sessions, activeSessionId, unreadIds, supported,
    setActiveSessionId, clearUnread,
  } = useSession();
  const { sendMessage } = useWebSocket();
  const { setMessages, setHistoryCursor } = useChatHistory();

  const switchTo = useCallback((id: string) => {
    if (!id || id === activeSessionId) return;
    // 낙관적 전환: 응답을 기다리지 않고 바로 활성 표시를 옮긴다.
    setActiveSessionId(id);
    clearUnread(id);
    setMessages([]);
    setHistoryCursor({ oldestId: null, hasMore: false, loading: true });
    sendMessage({ type: 'switch-session', conversation_id: id });
    sendMessage({ type: 'fetch-letta-history', limit: 50, conversation_id: id });
  }, [activeSessionId, setActiveSessionId, clearUnread, setMessages, setHistoryCursor, sendMessage]);

  const createSession = useCallback(() => {
    // 생성 성공 시 백엔드가 그 세션으로 전환한 뒤 session-list 를 돌려준다.
    setMessages([]);
    setHistoryCursor({ oldestId: null, hasMore: false, loading: false });
    sendMessage({ type: 'create-session' });
  }, [sendMessage, setMessages, setHistoryCursor]);

  const deleteSession = useCallback((id: string) => {
    if (!id || id === 'default') return;
    sendMessage({ type: 'delete-session', conversation_id: id });
  }, [sendMessage]);

  const renameSession = useCallback((id: string, summary: string) => {
    if (!id || id === 'default') return;
    sendMessage({ type: 'rename-session', conversation_id: id, summary });
  }, [sendMessage]);

  return {
    sessions,
    activeSessionId,
    unreadIds,
    supported,
    switchTo,
    createSession,
    deleteSession,
    renameSession,
  };
}

/** 레일 아이콘에 넣을 짧은 라벨 (디스코드 서버 이니셜과 같은 역할) */
export function sessionLabel(session: SessionInfo, index: number): string {
  if (session.is_default) return '메인';
  const summary = (session.summary || '').trim();
  if (summary) return summary.slice(0, 2);
  return String(index);
}

/** 호버 툴팁에 띄울 전체 설명 */
export function sessionTooltip(session: SessionInfo, index: number): string {
  if (session.is_default) return '메인 세션';
  const summary = (session.summary || '').trim();
  if (summary) return summary;
  return `세션 ${index}`;
}
