/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-use-before-define */
import { Subject } from 'rxjs';
import { ModelInfo } from '@/context/live2d-config-context';
import { HistoryInfo } from '@/context/websocket-context';
import { ConfigFile } from '@/context/character-config-context';
import { SessionInfo } from '@/context/session-context';
import { toaster } from '@/components/ui/toaster';

export interface DisplayText {
  text: string;
  name: string;
  avatar: string;
}

interface BackgroundFile {
  name: string;
  url: string;
}

export interface AudioPayload {
  type: 'audio';
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  display_text?: DisplayText;
  actions?: Actions;
}

export interface Message {
  id: string;
  content: string;
  role: "ai" | "human";
  timestamp: string;
  name?: string;
  avatar?: string;

  // Fields for different message types (make optional)
  type?: 'text' | 'tool_call_status' | 'progress_update' | 'image_display'; // Add possible types, default to 'text' if omitted
  tool_id?: string; // Specific to tool calls
  tool_name?: string; // Specific to tool calls
  status?: 'running' | 'completed' | 'error'; // Specific to tool calls
  // Fields for image_display type
  image_base64?: string;
  mime_type?: string;
  image_label?: string;
}

export interface Actions {
  expressions?: string[] | number [];
  pictures?: string[];
  sounds?: string[];
  gaze?: { x: number; y: number };
  movement?: { dx: number; dy: number } | { x: number; y: number };
  model_scale?: number;
  volume_adjustment?: number;
}

export interface MessageEvent {
  tool_id: any;
  tool_name: any;
  name: any;
  status: any;
  content: string;
  timestamp: string;
  type: string;
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  files?: BackgroundFile[];
  actions?: Actions;
  text?: string;
  model_info?: ModelInfo;
  conf_name?: string;
  conf_uid?: string;
  character_name?: string;
  human_name?: string;
  uids?: string[];
  messages?: Message[];
  history_uid?: string;
  success?: boolean;
  histories?: HistoryInfo[];
  configs?: ConfigFile[];
  message?: string;
  members?: string[];
  is_owner?: boolean;
  client_uid?: string;
  forwarded?: boolean;
  display_text?: DisplayText;
  live2d_model?: string;
  browser_view?: {
    debuggerFullscreenUrl: string;
    debuggerUrl: string;
    pages: {
      id: string;
      url: string;
      faviconUrl: string;
      title: string;
      debuggerUrl: string;
      debuggerFullscreenUrl: string;
    }[];
    wsUrl: string;
    sessionId?: string;
  };
  // agent_status 이벤트 필드 — 채팅창 마지막 스피너 표시용
  detail?: string;
  // letta-history-data (재접속 대화 복원, TODO19 1단계)
  oldest_id?: string | null;
  has_more?: boolean;
  append?: boolean;
  supported?: boolean;
  // new-history-created: 접속 시 자동 생성인지 여부
  initial?: boolean;
  // 다중 세션 (TODO19 2단계)
  sessions?: SessionInfo[];
  active_id?: string;
  created_id?: string;
  deleted_id?: string | null;
  action?: string;
  // 미즈키가 턴 끝에 남긴 세션 한 줄 요약
  session_id?: string;
  gist?: string;
  // 다중 세션 동시 처리 (TODO19 3단계)
  /** 지금 작업이 돌고 있는 세션 id 목록 (session-list) */
  running_ids?: string[];
  /** 아직 열어보지 않은 발화가 쌓인 세션 id 목록 (session-list) */
  unread_ids?: string[];
  /** 전환한 세션에서 작업이 계속 돌고 있는지 (session-switched) */
  running?: boolean;
  /** 그 세션에 쌓여 대기 중인 턴 수 (session-switched) */
  pending_turns?: number;
  /** 뒤늦게 재생되는 발화 — 채팅 기록에 다시 쌓지 않는다 (audio) */
  replay_only?: boolean;
  /** letta-history-data 가 어느 세션의 복원인지 */
  conversation_id?: string;
  /** 도구 승인 요청이 올라온 세션 이름 (tool-approval-request) */
  session_name?: string;
}

// Get translation function for error messages
const getTranslation = () => {
  try {
    const i18next = require('i18next').default;
    return i18next.t.bind(i18next);
  } catch (e) {
    // Fallback if i18next is not available
    return (key: string) => key;
  }
};

class WebSocketService {
  private static instance: WebSocketService;

  private ws: WebSocket | null = null;

  private messageSubject = new Subject<MessageEvent>();

  private stateSubject = new Subject<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>();

  private currentState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' = 'CLOSED';

  // ── 자동 재접속 ────────────────────────────────────────────────────────────
  // 백엔드를 재기동하면 소켓이 닫히는데, 기존 구현은 상태만 CLOSED 로 바꾸고
  // 끝이어서 사용자가 화면을 수동으로 새로고침해야 했다. launchd 전환 이후
  // 백엔드 재기동이 일상이 되므로 지수 백오프로 스스로 다시 붙는다.
  private lastUrl: string | null = null;

  private manualClose = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempts = 0;

  static getInstance() {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private initializeConnection() {
    this.sendMessage({
      type: 'fetch-backgrounds',
    });
    this.sendMessage({
      type: 'fetch-configs',
    });
    this.sendMessage({
      type: 'fetch-history-list',
    });
    // initial 플래그: 이 create-new-history 는 사용자가 "새 세션" 버튼을 누른 게 아니라
    // 접속할 때 자동으로 나가는 것이다. 백엔드가 이 값을 그대로 돌려주면 프론트는
    // 채팅창을 비우지 않고(= 지난 대화 유지) 아래 fetch-letta-history 결과로 채운다.
    this.sendMessage({
      type: 'create-new-history',
      initial: true,
    });
    // 다중 세션 목록 (TODO19 2단계). letta 이외 agent 면 supported=false 가 와서 레일이 숨는다.
    this.sendMessage({
      type: 'fetch-session-list',
    });
    // 재접속 대화 복원 (TODO19 1단계): 진짜 대화 원본인 letta 에서 직접 읽어온다.
    this.sendMessage({
      type: 'fetch-letta-history',
      limit: 50,
    });
  }

  connect(url: string) {
    if (this.ws?.readyState === WebSocket.CONNECTING ||
        this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    this.lastUrl = url;
    this.manualClose = false;
    this.clearReconnectTimer();

    try {
      this.ws = new WebSocket(url);
      this.currentState = 'CONNECTING';
      this.stateSubject.next('CONNECTING');

      this.ws.onopen = () => {
        this.currentState = 'OPEN';
        this.stateSubject.next('OPEN');
        this.reconnectAttempts = 0;
        console.log(`[WS] Connected to ${url}`);
        this.initializeConnection();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type !== 'audio') {
            console.log(`[WS] Received message type: ${message.type}`);
          } else {
            console.log(`[WS] Received audio message, text: "${message.display_text?.text ?? '(none)'}", hasAudio: ${!!message.audio}`);
          }
          this.messageSubject.next(message);
        } catch (error) {
          console.error('[WS] Failed to parse WebSocket message:', error, 'raw:', event.data?.slice?.(0, 200));
          toaster.create({
            title: `${getTranslation()('error.failedParseWebSocket')}: ${error}`,
            type: "error",
            duration: 2000,
          });
        }
      };

      this.ws.onclose = (event) => {
        this.currentState = 'CLOSED';
        this.stateSubject.next('CLOSED');
        console.warn(`[WS] Connection closed. code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`);
        this.scheduleReconnect();
      };

      this.ws.onerror = (event) => {
        this.currentState = 'CLOSED';
        this.stateSubject.next('CLOSED');
        console.error('[WS] Connection error:', event);
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.currentState = 'CLOSED';
      this.stateSubject.next('CLOSED');
      this.scheduleReconnect();
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.manualClose || !this.lastUrl) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 10000);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualClose || !this.lastUrl) return;
      this.connect(this.lastUrl);
    }, delay);
  }

  sendMessage(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not open. Unable to send message:', message);
      toaster.create({
        title: getTranslation()('error.websocketNotOpen'),
        type: 'error',
        duration: 2000,
      });
    }
  }

  onMessage(callback: (message: MessageEvent) => void) {
    return this.messageSubject.subscribe(callback);
  }

  onStateChange(callback: (state: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED') => void) {
    return this.stateSubject.subscribe(callback);
  }

  disconnect() {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
  }

  getCurrentState() {
    return this.currentState;
  }
}

export const wsService = WebSocketService.getInstance();
