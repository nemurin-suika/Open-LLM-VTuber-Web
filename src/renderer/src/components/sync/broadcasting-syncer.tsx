import { useEffect } from 'react';
import { useWebSocket } from '@/context/websocket-context';
import { useBroadcasting } from '@/context/broadcasting-context';

/**
 * isBroadcasting 토글 또는 WS 재연결 시점에 백엔드로 'set-broadcasting' 메시지를 보낸다.
 * 라이브 채팅처럼 백엔드에서만 트리거되는 경로도 최신 broadcasting 상태를 알 수 있게 됨.
 *
 * 반드시 WebSocketHandler(=WebSocketProvider) 안에 배치해야 함.
 */
export function BroadcastingSyncer(): null {
  const { isBroadcasting } = useBroadcasting();
  const { sendMessage, wsState } = useWebSocket();

  useEffect(() => {
    if (wsState !== 'OPEN') return;
    sendMessage({ type: 'set-broadcasting', is_broadcasting: isBroadcasting });
  }, [isBroadcasting, wsState, sendMessage]);

  return null;
}
