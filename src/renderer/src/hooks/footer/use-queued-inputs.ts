import { useCallback } from 'react';
import { useSession, QueuedInput } from '@/context/session-context';
import { useWebSocket } from '@/context/websocket-context';

const EMPTY: QueuedInput[] = [];

/**
 * 작업 중 세션의 입력 큐잉 — 지금 보고 있는 세션의 대기 목록
 *
 * 미즈키가 그 세션에서 턴을 돌고 있는 동안 보낸 입력은 백엔드가 큐에 쌓고
 * 턴이 끝나는 즉시 이어서 처리한다. 목록은 서버가 보내주는 session-queue
 * 스냅샷(= 그 세션의 전체 대기 목록)으로만 갱신된다.
 *
 * 취소는 cancel-queued-input 을 보내고 화면에서 먼저 지우는 낙관적 처리지만,
 * 최종 상태는 서버가 뒤이어 보내주는 스냅샷이 결정한다.
 */
export function useQueuedInputs() {
  const { activeSessionId, queuedInputs, removeQueuedInput } = useSession();
  const { sendMessage } = useWebSocket();

  const items = queuedInputs[activeSessionId] || EMPTY;

  const cancel = useCallback((itemId: string) => {
    if (!itemId) return;
    sendMessage({
      type: 'cancel-queued-input',
      session_id: activeSessionId,
      id: itemId,
    });
    removeQueuedInput(activeSessionId, itemId);
  }, [sendMessage, activeSessionId, removeQueuedInput]);

  return { items, cancel };
}
