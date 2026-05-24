import {
  createContext, useContext, ReactNode, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { useTriggerSpeak } from '@/hooks/utils/use-trigger-speak';
import { useAiState, AiStateEnum, AiState } from '@/context/ai-state-context';

export type ProactiveMode = 'broadcast' | 'private';

interface ProactiveSpeakSettings {
  allowButtonTrigger: boolean;
  allowProactiveSpeak: boolean
  idleSecondsToSpeak: number
  mode: ProactiveMode
}

interface ProactiveSpeakContextType {
  settings: ProactiveSpeakSettings
  updateSettings: (newSettings: ProactiveSpeakSettings) => void
  resetIdleTimer: () => void
  pauseIdleTimer: () => void
  markResume: () => void
  resumeIdleTimer: () => void
}

const defaultSettings: ProactiveSpeakSettings = {
  allowProactiveSpeak: true,
  idleSecondsToSpeak: 20,
  allowButtonTrigger: false,
  mode: 'broadcast',
};

export const ProactiveSpeakContext = createContext<ProactiveSpeakContextType | null>(null);

export function ProactiveSpeakProvider({ children }: { children: ReactNode }) {
  const [rawSettings, setSettings] = useLocalStorage<ProactiveSpeakSettings>(
    'proactiveSpeakSettings',
    defaultSettings,
  );
  // 기존 localStorage에 mode 같은 신규 필드가 없을 수 있으니 defaults와 merge
  const settings: ProactiveSpeakSettings = useMemo(
    () => ({ ...defaultSettings, ...rawSettings }),
    [rawSettings],
  );

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

  useEffect(() => {
    aiStateRef.current = aiState;
  }, [aiState]);

  useEffect(() => {
    modeRef.current = settings.mode;
  }, [settings.mode]);

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
      sendTriggerSignal((Date.now() - idleActualStartRef.current!) / 1000, modeRef.current);
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
      sendTriggerSignal(elapsed, modeRef.current);
      return;
    }

    idleStartTimeRef.current = idleActualStartRef.current;
    idleTimerRef.current = setTimeout(() => {
      if (aiStateRef.current !== AiStateEnum.IDLE) return;
      sendTriggerSignal((Date.now() - idleActualStartRef.current!) / 1000, modeRef.current);
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
