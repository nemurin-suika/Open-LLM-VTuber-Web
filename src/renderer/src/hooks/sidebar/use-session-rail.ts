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
    // 세션 이름도 같이 보낸다 → 미즈키가 발화 앞의 [세션] 태그로 받아본다.
    const idx = sessions.findIndex((s) => s.id === id);
    sendMessage({
      type: 'switch-session',
      conversation_id: id,
      name: sessionName(sessions[idx], idx < 0 ? 0 : idx),
    });
    sendMessage({ type: 'fetch-letta-history', limit: 50, conversation_id: id });
  }, [sessions, activeSessionId, setActiveSessionId, clearUnread, setMessages, setHistoryCursor, sendMessage]);

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
    // 메인(default)도 이름은 바꿀 수 있다. 삭제만 막는다.
    if (!id) return;
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
  const name = sessionName(session, index);
  if (session.is_default) return name.slice(0, 2) || '메인';
  const trimmed = name.trim();
  if (trimmed && !trimmed.startsWith('세션 ')) return trimmed.slice(0, 2);
  return String(index);
}

/** 사용자가 정한 세션 이름. 없으면 순번으로 대체 */
export function sessionName(session: SessionInfo | undefined, index: number): string {
  if (!session) return '';
  const name = (session.name ?? session.summary ?? '').trim();
  if (name) return name;
  return session.is_default ? '메인' : `세션 ${index}`;
}

/** 미즈키가 남긴 최근 대화 한 줄 요약 (없으면 빈 문자열) */
export function sessionGist(session: SessionInfo): string {
  return (session.gist || '').trim();
}

/** 호버 툴팁 한 줄 텍스트 (confirm 대화상자 등 평문이 필요한 곳용) */
export function sessionTooltip(session: SessionInfo, index: number): string {
  const name = sessionName(session, index);
  const gist = sessionGist(session);
  return gist ? `${name} — ${gist}` : name;
}
