import {
  createContext, useContext, ReactNode, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { useTriggerSpeak } from '@/hooks/utils/use-trigger-speak';
import { useAiState, AiStateEnum, AiState } from '@/context/ai-state-context';
import { useViewer } from '@/context/viewer-context';

export type ProactiveMode = 'broadcast' | 'private';

interface ProactiveSpeakSettings {
  allowButtonTrigger: boolean;
  allowProactiveSpeak: boolean
  idleSecondsToSpeak: number
  mode: ProactiveMode
  // proactive 트리거 시 백엔드 기본 프롬프트 뒤에 덧붙일 사용자 지시문.
  // 예: "지금은 방해 금지. 조용히 지켜만 보고 꼭 필요할 때만 말해."
  proactiveInstruction: string
}

interface ProactiveSpeakContextType {
  settings: ProactiveSpeakSettings
  updateSettings: (newSettings: ProactiveSpeakSettings) => void
  resetIdleTimer: () => void
  pauseIdleTimer: () => void
  markResume: () => void
  resumeIdleTimer: () => void
}

// 2026-10-24: 자발 발화 기본값을 off 로 변경(브라우저/Electron 공통).
// 새 브라우저에서 접속하자마자 말을 걸던 동작을 막기 위함. 켜려면 사이드바에서 직접 on.
const defaultSettings: ProactiveSpeakSettings = {
  allowProactiveSpeak: false,
  idleSecondsToSpeak: 20,
  allowButtonTrigger: false,
  mode: 'broadcast',
  proactiveInstruction: '',
};

// 기본값 변경 이전에 localStorage 에 on 으로 저장돼 있던 설정을 1회만 off 로 내린다.
// 이 플래그가 세워진 뒤 사용자가 직접 켠 값은 그대로 유지된다.
const DEFAULT_OFF_MIGRATION_KEY = 'proactiveSpeakSettings.defaultOffApplied';

export const ProactiveSpeakContext = createContext<ProactiveSpeakContextType | null>(null);

export function ProactiveSpeakProvider({ children }: { children: ReactNode }) {
  const [rawSettings, setSettings] = useLocalStorage<ProactiveSpeakSettings>(
    'proactiveSpeakSettings',
    defaultSettings,
  );
  // TODO2 1-10: 자발 발화는 전역 턴 큐를 점유하므로 주인 전용이다.
  // 손님 브라우저의 localStorage 에 예전 값이 켜져 있어도 여기서 꺼버려서
  // idle 타이머 자체가 돌지 않게 한다 (백엔드에서도 신호를 버린다).
  const { isOwnerViewer } = useViewer();

  // 기존 localStorage에 mode 같은 신규 필드가 없을 수 있으니 defaults와 merge
  const settings: ProactiveSpeakSettings = useMemo(
    () => ({
      ...defaultSettings,
      ...rawSettings,
      allowProactiveSpeak: isOwnerViewer
        ? { ...defaultSettings, ...rawSettings }.allowProactiveSpeak
        : false,
    }),
    [rawSettings, isOwnerViewer],
  );

  // 기본값 off 전환 1회 마이그레이션
  useEffect(() => {
    try {
      if (window.localStorage.getItem(DEFAULT_OFF_MIGRATION_KEY)) return;
      window.localStorage.setItem(DEFAULT_OFF_MIGRATION_KEY, '1');
      if (rawSettings?.allowProactiveSpeak) {
        setSettings({ ...defaultSettings, ...rawSettings, allowProactiveSpeak: false });
      }
    } catch (error) {
      console.error('proactive 기본값 off 마이그레이션 실패:', error);
    }
    // 최초 마운트 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { aiState } = useAiState();
  const { sendTriggerSignal } = useTriggerSpeak();

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleStartTimeRef = useRef<number | null>(null);
  // 이번 idle 구간이 실제로 시작된 시각 (타이머 일시중단 시에도 유지)
  const idleActualStartRef = useRef<number | null>(null);
  // speech-ignored 후 타이머를 재개해야 할 때 true로 설정
  const shouldResumeRef = useRef(false);
  const aiStateRef = useRef<AiState>(aiState);
  // setTimeout 콜백이 항상 최신 mode를 참조하도록 ref로 보관
  const modeRef = useRef<ProactiveMode>(settings.mode);
  // 지시문도 동일 이유로 ref 보관 (타이머 재시작 없이 즉시 반영)
  const instructionRef = useRef<string>(settings.proactiveInstruction);

  useEffect(() => {
    aiStateRef.current = aiState;
  }, [aiState]);

  useEffect(() => {
    modeRef.current = settings.mode;
  }, [settings.mode]);

  useEffect(() => {
    instructionRef.current = settings.proactiveInstruction;
  }, [settings.proactiveInstruction]);

  // 타이머 콜백만 취소 (idleActualStartRef는 유지해 재개에 사용)
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    idleStartTimeRef.current = null;
  }, []);

  // 처음부터 새로 시작 (idleActualStartRef 리셋)
  const startFreshIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (!settings.allowProactiveSpeak) return;

    const now = Date.now();
    idleActualStartRef.current = now;
    idleStartTimeRef.current = now;

    idleTimerRef.current = setTimeout(() => {
      if (aiStateRef.current !== AiStateEnum.IDLE) return;
      sendTriggerSignal(
        (Date.now() - idleActualStartRef.current!) / 1000,
        modeRef.current,
        instructionRef.current,
      );
    }, settings.idleSecondsToSpeak * 1000);
  }, [settings.allowProactiveSpeak, settings.idleSecondsToSpeak, sendTriggerSignal, clearIdleTimer]);

  // speech-ignored 후 남은 시간부터 재개
  const doResumeIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (!settings.allowProactiveSpeak) {
      return;
    }

    if (!idleActualStartRef.current) {
      startFreshIdleTimer();
      return;
    }

    const elapsed = (Date.now() - idleActualStartRef.current) / 1000;
    const remaining = settings.idleSecondsToSpeak - elapsed;

    if (remaining <= 0) {
      sendTriggerSignal(elapsed, modeRef.current, instructionRef.current);
      return;
    }

    idleStartTimeRef.current = idleActualStartRef.current;
    idleTimerRef.current = setTimeout(() => {
      if (aiStateRef.current !== AiStateEnum.IDLE) return;
      sendTriggerSignal(
        (Date.now() - idleActualStartRef.current!) / 1000,
        modeRef.current,
        instructionRef.current,
      );
    }, remaining * 1000);
  }, [settings.allowProactiveSpeak, settings.idleSecondsToSpeak, sendTriggerSignal, clearIdleTimer, startFreshIdleTimer]);

  useEffect(() => {
    if (aiState === AiStateEnum.IDLE) {
      if (shouldResumeRef.current) {
        shouldResumeRef.current = false;
        doResumeIdleTimer();
      } else {
        startFreshIdleTimer();
      }
    } else {
      clearIdleTimer();
    }
  }, [aiState, startFreshIdleTimer, doResumeIdleTimer, clearIdleTimer]);

  useEffect(() => () => {
    clearIdleTimer();
  }, [clearIdleTimer]);

  const updateSettings = useCallback((newSettings: ProactiveSpeakSettings) => {
    setSettings(newSettings);
  }, [setSettings]);

  // 타이핑/음성 감지 시 타이머를 처음부터 재시작
  const resetIdleTimer = useCallback(() => {
    if (aiStateRef.current === AiStateEnum.IDLE) {
      startFreshIdleTimer();
    }
  }, [startFreshIdleTimer]);

  // 음성 감지 초기에 타이머 일시중단 (idleActualStartRef 유지)
  const pauseIdleTimer = useCallback(() => {
    clearIdleTimer();
  }, [clearIdleTimer]);

  // speech-ignored 수신 시 호출 → 다음 IDLE 진입 시 타이머 재개
  const markResume = useCallback(() => {
    shouldResumeRef.current = true;
  }, []);

  const contextValue = useMemo(() => ({
    settings,
    updateSettings,
    resetIdleTimer,
    pauseIdleTimer,
    markResume,
    resumeIdleTimer: doResumeIdleTimer,
  }), [settings, updateSettings, resetIdleTimer, pauseIdleTimer, markResume, doResumeIdleTimer]);

  return (
    <ProactiveSpeakContext.Provider value={contextValue}>
      {children}
    </ProactiveSpeakContext.Provider>
  );
}

export function useProactiveSpeak() {
  const context = useContext(ProactiveSpeakContext);
  if (!context) {
    throw new Error('useProactiveSpeak must be used within a ProactiveSpeakProvider');
  }
  return context;
}
