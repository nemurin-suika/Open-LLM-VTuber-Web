import { useAiState } from '@/context/ai-state-context';
import { useWebSocket } from '@/context/websocket-context';
import { useChatHistory } from '@/context/chat-history-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { useSubtitle } from '@/context/subtitle-context';
import { useAudioTask } from './use-audio-task';

export const useInterrupt = () => {
  const { aiState, setAiState } = useAiState();
  const { sendMessage } = useWebSocket();
  const { fullResponse, clearResponse, setAgentStatus } = useChatHistory();
  // const { currentModel } = useLive2DModel();
  const { subtitleText, setSubtitleText } = useSubtitle();
  const { stopCurrentAudioAndLipSync } = useAudioTask();

  const interrupt = (sendSignal = true) => {
    // thinking-speaking: 정상 응답 중 인터럽트
    // idle: 장기 스킬 작업(claude -p 멀티턴 등) 중 상태가 idle로 잘못 표시된 경우 abort 신호 전송
    const canInterrupt = aiState === 'thinking-speaking' || aiState === 'idle';
    if (!canInterrupt) return;
    console.log('Interrupting conversation chain');

    // 오디오/립싱크 중단은 실제로 재생 중인 thinking-speaking 상태에서만
    if (aiState === 'thinking-speaking') {
      stopCurrentAudioAndLipSync();
      audioTaskQueue.clearQueue();
    }

    setAiState('interrupted');

    if (sendSignal) {
      sendMessage({
        type: 'interrupt-signal',
        text: fullResponse,
      });
    }

    clearResponse();

    // 스피너 즉시 끄기: 인터럽트 시 백엔드 finally 블록의 idle 이벤트를 기다리지 않고 프론트에서 선제적으로 종료
    setAgentStatus({ status: 'idle', timestamp: Date.now() });

    if (subtitleText === 'Thinking...') {
      setSubtitleText('');
    }
    console.log('Interrupted!');
  };

  return { interrupt };
};
