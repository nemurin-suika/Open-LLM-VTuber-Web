/* eslint-disable react/jsx-no-constructed-context-values */
import React, { useContext, useCallback, useMemo } from 'react';
import { wsService } from '@/services/websocket-service';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';

const isElectron = typeof window !== 'undefined' && window.api !== undefined;

// 백엔드가 자기 포트로 웹 빌드본을 직접 서빙하므로, 브라우저에서는
// 접속한 주소를 그대로 백엔드 주소로 쓸 수 있다.
// https로 들어오면 ws:// 평문은 혼합 콘텐츠로 차단되므로 wss://를 골라야 한다.
function resolveServerDefaults(): { wsUrl: string; baseUrl: string } {
  const servedFromBackend = !isElectron
    && !import.meta.env.DEV
    && typeof window !== 'undefined'
    && (window.location.protocol === 'http:' || window.location.protocol === 'https:');

  if (servedFromBackend) {
    const { protocol, host, origin } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return { wsUrl: `${wsProtocol}//${host}/client-ws`, baseUrl: origin };
  }

  // Electron 앱은 로컬 백엔드, dev 서버(npm run dev)는 개발용 호스트를 그대로 유지
  const host = import.meta.env.DEV ? '192.168.0.5' : '127.0.0.1';
  return { wsUrl: `ws://${host}:12393/client-ws`, baseUrl: `http://${host}:12393` };
}

const DEFAULTS = resolveServerDefaults();
const DEFAULT_WS_URL = DEFAULTS.wsUrl;
const DEFAULT_BASE_URL = DEFAULTS.baseUrl;

// https 페이지에서 예전에 저장된 평문 주소를 쓰면 브라우저가 연결을 차단한다.
// 그런 경우에만 저장값을 버리고 현재 주소 기준 기본값으로 되돌린다.
function sanitizeStoredUrl(stored: string, fallback: string): string {
  if (typeof window === 'undefined') return stored;
  if (window.location.protocol !== 'https:') return stored;
  if (!stored) return fallback;
  if (/^(ws|http):\/\//i.test(stored)) return fallback;
  return stored;
}

export interface HistoryInfo {
  uid: string;
  latest_message: {
    role: 'human' | 'ai';
    timestamp: string;
    content: string;
  } | null;
  timestamp: string | null;
}

interface WebSocketContextProps {
  sendMessage: (message: object) => void;
  wsState: string;
  reconnect: () => void;
  wsUrl: string;
  setWsUrl: (url: string) => void;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
}

export const WebSocketContext = React.createContext<WebSocketContextProps>({
  sendMessage: wsService.sendMessage.bind(wsService),
  wsState: 'CLOSED',
  reconnect: () => wsService.connect(DEFAULT_WS_URL),
  wsUrl: DEFAULT_WS_URL,
  setWsUrl: () => {},
  baseUrl: DEFAULT_BASE_URL,
  setBaseUrl: () => {},
});

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export const defaultWsUrl = DEFAULT_WS_URL;
export const defaultBaseUrl = DEFAULT_BASE_URL;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [storedWsUrl, setWsUrl] = useLocalStorage('wsUrl', DEFAULT_WS_URL);
  const [storedBaseUrl, setBaseUrl] = useLocalStorage('baseUrl', DEFAULT_BASE_URL);
  const wsUrl = useMemo(
    () => sanitizeStoredUrl(storedWsUrl, DEFAULT_WS_URL),
    [storedWsUrl],
  );
  const baseUrl = useMemo(
    () => sanitizeStoredUrl(storedBaseUrl, DEFAULT_BASE_URL),
    [storedBaseUrl],
  );
  const handleSetWsUrl = useCallback((url: string) => {
    setWsUrl(url);
    wsService.connect(url);
  }, [setWsUrl]);

  const value = {
    sendMessage: wsService.sendMessage.bind(wsService),
    wsState: 'CLOSED',
    reconnect: () => wsService.connect(wsUrl),
    wsUrl,
    setWsUrl: handleSetWsUrl,
    baseUrl,
    setBaseUrl,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
