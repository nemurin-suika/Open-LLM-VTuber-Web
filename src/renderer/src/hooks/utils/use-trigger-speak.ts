import { useCallback } from 'react';
import { useWebSocket } from '@/context/websocket-context';
import { ProactiveMode } from '@/context/proactive-speak-context';
import { useMediaCapture } from './use-media-capture';

export function useTriggerSpeak() {
  const { sendMessage } = useWebSocket();
  const { captureAllMedia, captureSystemAudio } = useMediaCapture();

  // mode를 인자로 받음 — ProactiveSpeakProvider가 자기 settings를 읽어 넘겨준다.
  // useProactiveSpeak를 여기서 부르면 순환 참조(provider → useTriggerSpeak → useProactiveSpeak → 자기 context).
  const sendTriggerSignal = useCallback(
    async (
      actualIdleTime: number,
      mode: ProactiveMode = 'broadcast',
      proactiveInstruction = '',
    ) => {
      // private 모드는 화면 + 시스템 오디오 둘 다 함께 전송
      const [images, system_audio] = mode === 'private'
        ? await Promise.all([captureAllMedia(), captureSystemAudio()])
        : [await captureAllMedia(), null];

      sendMessage({
        type: "ai-speak-signal",
        idle_time: actualIdleTime,
        mode,
        images,
        system_audio,
        proactive_instruction: proactiveInstruction?.trim() || '',
      });
    },
    [sendMessage, captureAllMedia, captureSystemAudio],
  );

  return {
    sendTriggerSignal,
  };
}
