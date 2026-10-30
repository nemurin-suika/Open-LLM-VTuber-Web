/* eslint-disable no-sparse-arrays */
/* eslint-disable react-hooks/exhaustive-deps */
// eslint-disable-next-line object-curly-newline
import { useEffect, useState, useCallback, useMemo, useRef, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { wsService, MessageEvent } from '@/services/websocket-service';
import {
  WebSocketContext, HistoryInfo, defaultWsUrl, defaultBaseUrl,
} from '@/context/websocket-context';
import { ModelInfo, useLive2DConfig } from '@/context/live2d-config-context';
import { useSubtitle } from '@/context/subtitle-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { useAudioTask } from '@/components/canvas/live2d';
import { useBgUrl } from '@/context/bgurl-context';
import { useConfig } from '@/context/character-config-context';
import { useChatHistory } from '@/context/chat-history-context';
import { toaster } from '@/components/ui/toaster';
import { useVAD } from '@/context/vad-context';
import { AiState, useAiState } from "@/context/ai-state-context";
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { useGroup } from '@/context/group-context';
import { useInterrupt } from '@/hooks/utils/use-interrupt';
import { useBrowser } from '@/context/browser-context';
import { stripLLMTags } from '@/utils/text-filter';
import { resetGazeToCenter, configureIdleGaze, enableIdleGaze } from '@/utils/gaze-animator';
import { configureWind } from '@/utils/wind-animator';
import { ProactiveSpeakContext } from '@/context/proactive-speak-context';
import { audioManager } from '@/utils/audio-manager';
import { useClaudeUsage } from '@/context/claude-usage-context';
import { useSession } from '@/context/session-context';
import { useViewer } from '@/context/viewer-context';

function WebSocketHandler({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [wsState, setWsState] = useState<string>('CLOSED');
  const [wsUrl, setWsUrl] = useLocalStorage<string>('wsUrl', defaultWsUrl);
  const [baseUrl, setBaseUrl] = useLocalStorage<string>('baseUrl', defaultBaseUrl);
  const { aiState, setAiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setModelInfo } = useLive2DConfig();
  const { setSubtitleText } = useSubtitle();
  const { clearResponse, setForceNewMessage, appendHumanMessage, appendOrUpdateToolCallMessage, appendProgressMessage, appendImageMessage, setAgentStatus } = useChatHistory();
  const { addAudioTask } = useAudioTask();
  const bgUrlContext = useBgUrl();
  const {
    confUid, setConfName, setConfUid, setConfigFiles, setCharacterName, setHumanName,
  } = useConfig();
  const [pendingModelInfo, setPendingModelInfo] = useState<ModelInfo | undefined>(undefined);
  const { setSelfUid, setGroupMembers, setIsOwner } = useGroup();
  const { setViewer } = useViewer();
  const { startMic, stopMic, autoStartMicOnConvEnd } = useVAD();
  const proactiveSpeakCtx = useContext(ProactiveSpeakContext);
  const autoStartMicOnConvEndRef = useRef(autoStartMicOnConvEnd);
  const { interrupt } = useInterrupt();
  const { setBrowserViewData } = useBrowser();
  const { setUsage } = useClaudeUsage();
  const {
    setSessions, setActiveSessionId, setSupported: setSessionSupported,
    updateSessionGist, activeSessionId, markUnread, setUnreadIds, setUnreadCounts,
    setRunningIds, markRunning, clearRunning,
    setSessionQueue, clearSessionQueue, syncQueuedCounts,
  } = useSession();
  // 핸들러가 재구성되지 않아도 최신 활성 세션을 볼 수 있게 ref 로도 들고 있는다.
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    autoStartMicOnConvEndRef.current = autoStartMicOnConvEnd;
  }, [autoStartMicOnConvEnd]);

  useEffect(() => {
    if (pendingModelInfo && confUid) {
      setModelInfo(pendingModelInfo);
      setPendingModelInfo(undefined);
    }
  }, [pendingModelInfo, setModelInfo, confUid]);

  // Start idle gaze wandering once loaded; it runs in all states continuously
  useEffect(() => {
    if (aiState !== 'loading') {
      enableIdleGaze();
    }
  }, [aiState]);

  const {
    setCurrentHistoryUid, setMessages, setHistoryList, setHistoryCursor,
  } = useChatHistory();

  const handleControlMessage = useCallback((controlText: string) => {
    switch (controlText) {
      case 'start-mic':
        console.log('Starting microphone...');
        startMic();
        break;
      case 'stop-mic':
        console.log('Stopping microphone...');
        stopMic();
        break;
      case 'conversation-chain-start':
        console.log('[Handler] conversation-chain-start → clearing queue, state→thinking-speaking');
        setAiState('thinking-speaking');
        audioTaskQueue.clearQueue();
        clearResponse();
        audioManager.saveBaseVolume();
        // 스피너 유지: 백엔드 파이프라인이 시작됐음을 확실히 알린다.
        setAgentStatus({
          status: 'active',
          detail: '미즈키 응답 준비 중',
          timestamp: Date.now() / 1000,
        });
        break;
      case 'conversation-chain-end':
        console.log('[Handler] conversation-chain-end → scheduling idle task');
        // 대화 턴 자체가 완전히 끝났으므로 스피너를 즉시 idle 처리한다.
        // (백엔드 letta_agent finally 블록의 agent_status idle과 이중 안전장치)
        setAgentStatus({
          status: 'idle',
          detail: undefined,
          timestamp: Date.now() / 1000,
        });
        audioTaskQueue.addTask(() => new Promise<void>((resolve) => {
          setAiState((currentState: AiState) => {
            if (currentState === 'thinking-speaking') {
              // Auto start mic if enabled
              if (autoStartMicOnConvEndRef.current) {
                startMic();
              }
              return 'idle';
            }
            return currentState;
          });
          resetGazeToCenter();
          audioManager.restoreBaseVolume();
          resolve();
        }));
        break;
      case 'interrupt-success':
        // 인터럽트가 백엔드까지 전달됐음을 자막으로 표시 (2초 후 자동 지움)
        console.log('[Handler] interrupt-success → 자막 표시');
        setSubtitleText('⚡ 중단됨');
        setTimeout(() => setSubtitleText(''), 2000);
        break;
      case 'speech-ignored':
        // 키워드 없어서 무시된 음성 → 타이머를 재개(재시작 아님)하고 idle로 복귀
        proactiveSpeakCtx?.markResume();
        setAiState('idle');
        startMic();
        break;
      default:
        console.warn('Unknown control command:', controlText);
    }
  }, [setAiState, clearResponse, setForceNewMessage, startMic, stopMic, proactiveSpeakCtx, setSubtitleText]);

  const handleWebSocketMessage = useCallback((message: MessageEvent) => {
    console.log('Received message from server:', message);
    switch (message.type) {
      case 'control':
        if (message.text) {
          handleControlMessage(message.text);
        }
        break;
      case 'set-model-and-conf':
        setAiState('loading');
        if (message.conf_name) {
          setConfName(message.conf_name);
        }
        if (message.conf_uid) {
          setConfUid(message.conf_uid);
          console.log('confUid', message.conf_uid);
        }
        // 말풍선 화자 표시용 이름. conf_name(설정파일 이름)과 다름에 주의
        if (message.character_name) {
          setCharacterName(message.character_name);
        }
        if (message.human_name) {
          setHumanName(message.human_name);
        }
        if (message.client_uid) {
          setSelfUid(message.client_uid);
        }
        // TODO2 1-10: 접속자 본인 신원. 주인 전용 UI 노출 판단에 쓴다
        if (message.viewer) {
          setViewer(message.viewer);
        }
        setPendingModelInfo(message.model_info);
        // setModelInfo(message.model_info);
        // We don't know when the confRef in live2d-config-context will be updated, so we set a delay here for convenience
        if (message.model_info && !message.model_info.url.startsWith("http")) {
          const modelUrl = baseUrl + message.model_info.url;
          // eslint-disable-next-line no-param-reassign
          message.model_info.url = modelUrl;
        }

        if (message.wind_effect_config) {
          configureWind(message.wind_effect_config);
        }

        if (message.idle_gaze_config) {
          configureIdleGaze(message.idle_gaze_config);
        }

        setAiState('idle');
        break;
      case 'full-text':
        if (message.text) {
          setSubtitleText(stripLLMTags(message.text));
        }
        break;
      case 'config-files':
        if (message.configs) {
          setConfigFiles(message.configs);
        }
        break;
      case 'config-switched':
        setAiState('idle');
        setSubtitleText(t('notification.characterLoaded'));

        toaster.create({
          title: t('notification.characterSwitched'),
          type: 'success',
          duration: 2000,
        });

        // setModelInfo(undefined);

        wsService.sendMessage({ type: 'fetch-history-list' });
        wsService.sendMessage({ type: 'create-new-history' });
        break;
      case 'background-files':
        if (message.files) {
          bgUrlContext?.setBackgroundFiles(message.files);
        }
        break;
      case 'audio':
        if (aiState === 'interrupted' || aiState === 'listening') {
          console.warn(`[Handler] Audio skipped — aiState="${aiState}", text="${message.display_text?.text ?? ''}"`);
        } else {
          console.log(`[Handler] Queuing audio task — aiState="${aiState}", text="${message.display_text?.text ?? ''}", hasAudio=${!!message.audio}`, "actions", message.actions);
          addAudioTask({
            audioBase64: message.audio || '',
            volumes: message.volumes || [],
            sliceLength: message.slice_length || 0,
            displayText: message.display_text || null,
            expressions: message.actions?.expressions || null,
            gaze: message.actions?.gaze || null,
            movement: message.actions?.movement || null,
            model_scale: message.actions?.model_scale ?? null,
            volume_adjustment: message.actions?.volume_adjustment ?? null,
            forwarded: message.forwarded || false,
            // 비활성 세션에서 쌓였다가 뒤늦게 재생되는 발화 — 글은 이미 복원되어
            // 있으므로 채팅 기록에 또 추가하지 않고 소리와 입모양만 재생한다.
            replayOnly: message.replay_only || false,
          });
        }
        break;
      case 'history-data':
        if (message.messages) {
          setMessages(message.messages.map((msg) =>
            msg.type !== 'tool_call_status' && msg.content
              ? { ...msg, content: stripLLMTags(msg.content) }
              : msg,
          ));
        }
        toaster.create({
          title: t('notification.historyLoaded'),
          type: 'success',
          duration: 2000,
        });
        break;
      case 'letta-history-data': {
        // 재접속 대화 복원 (TODO19 1단계). 원본은 letta conversation.
        const restored = (message.messages || []) as Message[];
        if (restored.length > 0) {
          const cleaned = restored.map((msg) => (
            // 중간 진행 알림은 실시간 표시와 같은 원문을 그대로 보여준다
            // (대괄호가 섞여 있어도 지워지지 않도록 태그 제거를 건너뛴다).
            msg.content && msg.type !== 'progress_update'
              ? { ...msg, content: stripLLMTags(msg.content) }
              : msg
          ));
          if (message.append) {
            // 위로 스크롤해서 과거를 더 불러온 경우 — 앞쪽에 덧붙인다.
            setMessages((prev: Message[]) => {
              const known = new Set(prev.map((m) => m.id));
              return [...cleaned.filter((m) => !known.has(m.id)), ...prev];
            });
          } else {
            setMessages(cleaned);
          }
        }
        setHistoryCursor({
          oldestId: message.oldest_id ?? null,
          hasMore: Boolean(message.has_more),
          loading: false,
        });
        // 글 복원이 끝났으니, 이 세션에 쌓여 있던 마지막 발화를 음성으로 들려달라고 요청.
        // (버퍼가 없으면 백엔드가 조용히 무시한다)
        if (!message.append) {
          wsService.sendMessage({
            type: 'replay-session-buffer',
            conversation_id: message.conversation_id || activeSessionIdRef.current,
          });
        }
        break;
      }
      case 'new-history-created':
        setAiState('idle');
        // 접속할 때 자동으로 생기는 세션이면 화면을 건드리지 않는다.
        // (지난 대화는 letta-history-data 로 복원되므로 비우면 안 된다)
        if (message.initial) {
          if (message.history_uid) {
            setCurrentHistoryUid(message.history_uid);
          }
          break;
        }
        setSubtitleText(t('notification.newConversation'));
        // No need to open mic here
        if (message.history_uid) {
          setCurrentHistoryUid(message.history_uid);
          setMessages([]);
          const newHistory: HistoryInfo = {
            uid: message.history_uid,
            latest_message: null,
            timestamp: new Date().toISOString(),
          };
          setHistoryList((prev: HistoryInfo[]) => [newHistory, ...prev]);
          toaster.create({
            title: t('notification.newChatHistory'),
            type: 'success',
            duration: 2000,
          });
        }
        break;
      case 'history-deleted':
        toaster.create({
          title: message.success
            ? t('notification.historyDeleteSuccess')
            : t('notification.historyDeleteFail'),
          type: message.success ? 'success' : 'error',
          duration: 2000,
        });
        break;
      case 'history-list':
        if (message.histories) {
          setHistoryList(message.histories);
          if (message.histories.length > 0) {
            setCurrentHistoryUid(message.histories[0].uid);
          }
        }
        break;
      case 'user-input-transcription':
        console.log('user-input-transcription: ', message.text);
        if (message.text) {
          appendHumanMessage(message.text);
        }
        break;
      case 'error':
        toaster.create({
          title: message.message,
          type: 'error',
          duration: 2000,
        });
        break;
      case 'group-update':
        console.log('Received group-update:', message.members);
        if (message.members) {
          setGroupMembers(message.members);
        }
        if (message.is_owner !== undefined) {
          setIsOwner(message.is_owner);
        }
        break;
      case 'group-operation-result':
        toaster.create({
          title: message.message,
          type: message.success ? 'success' : 'error',
          duration: 2000,
        });
        break;
      case 'backend-synth-complete':
        setBackendSynthComplete(true);
        break;
      case 'conversation-chain-end':
        console.log('[Handler] conversation-chain-end (direct type) → scheduling idle task');
        setAgentStatus({
          status: 'idle',
          detail: undefined,
          timestamp: Date.now() / 1000,
        });
        audioTaskQueue.addTask(() => new Promise<void>((resolve) => {
          setAiState((currentState: AiState) => {
            if (currentState === 'thinking-speaking') {
              if (autoStartMicOnConvEndRef.current) {
                startMic();
              }
              return 'idle';
            }
            return currentState;
          });
          resetGazeToCenter();
          audioManager.restoreBaseVolume();
          resolve();
        }));
        break;
      case 'force-new-message':
        setForceNewMessage(true);
        break;
      case 'interrupt-signal':
        // Handle forwarded interrupt
        interrupt(false); // do not send interrupt signal to server
        break;
      case 'progress_update':
        // 다중 세션: 다른 세션에서 돌고 있는 작업의 중간 알림은 지금 화면에 끼우지 않는다.
        if (message.session_id && message.session_id !== activeSessionIdRef.current) {
          markUnread(message.session_id);
          markRunning(message.session_id);
          break;
        }
        if (message.text) {
          appendProgressMessage(message.text);
        }
        break;
      case 'session-activity':
        // 비활성 세션에서 발화가 완성됨 → 레일에 미확인 개수 배지
        if (message.session_id) {
          markUnread(message.session_id, message.count);
          clearRunning(message.session_id);
        }
        break;
      case 'tool_call_status':
        if (message.tool_id && message.tool_name && message.status) {
          // If there's browser view data included, store it in the browser context
          if (message.browser_view) {
            console.log('Browser view data received:', message.browser_view);
            setBrowserViewData(message.browser_view);
          }

          appendOrUpdateToolCallMessage({
            id: message.tool_id,
            type: 'tool_call_status',
            role: 'ai',
            tool_id: message.tool_id,
            tool_name: message.tool_name,
            name: message.name,
            status: message.status as ('running' | 'completed' | 'error'),
            content: message.content || '',
            timestamp: message.timestamp || new Date().toISOString(),
          });
        } else {
          console.warn('Received incomplete tool_call_status message:', message);
        }
        break;
      case 'image_display':
        if (message.image_base64 && message.mime_type) {
          appendImageMessage(message.image_base64, message.mime_type, message.label || message.image_label);
        }
        break;
      case 'tool-approval-request':
        // ToolApprovalDialog 컴포넌트가 wsService를 직접 구독해 처리한다. 여기선 무시.
        break;
      case 'claude_usage':
        if (message.data) {
          setUsage(message.data);
        }
        break;
      case 'agent_status':
        // 세션 활동 상태 — 채팅창 마지막 스피너 표시 제어
        setAgentStatus({
          status: (message.status === 'active' ? 'active' : 'idle'),
          detail: message.detail,
          timestamp: typeof message.timestamp === 'number' ? message.timestamp : undefined,
        });
        break;
      // ── 다중 세션 (TODO19 2단계) ──────────────────────────────────────────
      case 'session-list': {
        const isSupported = message.supported !== false;
        setSessionSupported(isSupported);
        if (!isSupported) break;
        setSessions(message.sessions || []);
        const active = message.active_id || 'default';
        setActiveSessionId(active);
        // 서버가 들고 있는 진행중·미확인 상태를 그대로 받아 레일에 표시
        // (새로고침해도 다른 세션 작업 상태가 유지된다)
        if (Array.isArray(message.running_ids)) {
          setRunningIds(message.running_ids.filter((id: string) => id !== active));
        }
        if (Array.isArray(message.unread_ids)) {
          setUnreadIds(message.unread_ids.filter((id: string) => id !== active));
        }
        // 작업 중 세션에 쌓인 전달 대기 입력 건수 (0 인 세션은 키가 없다).
        // 필드 자체가 없는 응답(= 아직 큐잉을 모르는 백엔드)에서는 들고 있던
        // 큐 상태를 지우지 않는다. 최종 상태는 session-queue 스냅샷이 결정한다.
        if (message.queued_counts && typeof message.queued_counts === 'object') {
          syncQueuedCounts(message.queued_counts);
        }
        if (message.unread_counts && typeof message.unread_counts === 'object') {
          const counts: Record<string, number> = {};
          Object.entries(message.unread_counts).forEach(([sid, n]) => {
            if (sid !== active && typeof n === 'number' && n > 0) counts[sid] = n;
          });
          setUnreadCounts(counts);
        }
        if (message.created_id) {
          // 새 세션은 대화가 비어 있는 상태로 시작한다 (기억은 agent 단위라 그대로 공유).
          setMessages([]);
          setHistoryCursor({ oldestId: null, hasMore: false, loading: false });
          toaster.create({ title: '새 세션을 만들었어', type: 'success', duration: 2000 });
        } else if (message.deleted_id) {
          toaster.create({ title: '세션을 삭제했어', type: 'success', duration: 2000 });
          // 사라진 세션의 대기 큐 상태도 같이 정리한다.
          clearSessionQueue(message.deleted_id);
          // 삭제된 세션이 활성이었으면 백엔드가 메인으로 되돌리므로 그쪽 대화를 다시 불러온다.
          setMessages([]);
          setHistoryCursor({ oldestId: null, hasMore: false, loading: true });
          wsService.sendMessage({
            type: 'fetch-letta-history', limit: 50, conversation_id: active,
          });
        }
        break;
      }
      case 'session-switched': {
        const switched = message.active_id || 'default';
        setActiveSessionId(switched);
        // 넘어온 세션에서 아직 작업이 돌고 있으면 진행 표시를 유지한다.
        if (message.running) markRunning(switched);
        else clearRunning(switched);
        break;
      }
      case 'session-queue': {
        // 작업 중 세션에 들어온 입력의 전체 대기 목록 스냅샷.
        // 빈 배열이면 큐가 비었다는 뜻이라 그 세션 큐 상태를 정리한다.
        const sid = message.session_id || activeSessionIdRef.current;
        setSessionQueue(sid, Array.isArray(message.items) ? message.items : []);
        break;
      }
      case 'session-gist-updated':
        // 미즈키가 턴 끝에 남긴 한 줄 요약 → 레일 호버 툴팁 둘째 줄
        updateSessionGist(message.session_id || 'default', message.gist || '');
        break;
      case 'session-error':
        toaster.create({
          title: message.message || '세션 작업에 실패했어',
          type: 'error',
          duration: 3000,
        });
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }, [setSessions, setActiveSessionId, setSessionSupported, updateSessionGist,
    markUnread, setUnreadIds, setUnreadCounts, setRunningIds, markRunning, clearRunning,
    setSessionQueue, clearSessionQueue, syncQueuedCounts, aiState, addAudioTask, appendHumanMessage, baseUrl, bgUrlContext, setAiState, setConfName, setConfUid, setConfigFiles, setCharacterName, setHumanName, setCurrentHistoryUid, setHistoryList, setMessages, setModelInfo, setSubtitleText, startMic, stopMic, setSelfUid, setGroupMembers, setIsOwner, setViewer, backendSynthComplete, setBackendSynthComplete, clearResponse, handleControlMessage, appendOrUpdateToolCallMessage, appendProgressMessage, appendImageMessage, interrupt, setBrowserViewData, setUsage, setAgentStatus, setHistoryCursor, t]);

  useEffect(() => {
    wsService.connect(wsUrl);
  }, [wsUrl]);

  // handleWebSocketMessage를 ref로 최신값 유지:
  // dependency 변경 시 함수가 재생성되어도 구독을 해제/재등록하지 않도록 한다.
  // 구독 해제 → 재구독 사이에 도착한 image_display 등 메시지가 버려지는 문제를 방지.
  const handleWebSocketMessageRef = useRef(handleWebSocketMessage);
  useEffect(() => {
    handleWebSocketMessageRef.current = handleWebSocketMessage;
  }, [handleWebSocketMessage]);

  useEffect(() => {
    const stateSubscription = wsService.onStateChange(setWsState);
    const messageSubscription = wsService.onMessage((msg) => handleWebSocketMessageRef.current(msg));
    return () => {
      stateSubscription.unsubscribe();
      messageSubscription.unsubscribe();
    };
  }, [wsUrl]); // wsUrl 변경(재연결) 시에만 재구독

  const webSocketContextValue = useMemo(() => ({
    sendMessage: wsService.sendMessage.bind(wsService),
    wsState,
    reconnect: () => wsService.connect(wsUrl),
    wsUrl,
    setWsUrl,
    baseUrl,
    setBaseUrl,
  }), [wsState, wsUrl, baseUrl]);

  return (
    <WebSocketContext.Provider value={webSocketContextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export default WebSocketHandler;
