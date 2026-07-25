import { useState } from 'react';
import { useWebSocket } from '@/context/websocket-context';
import { useAiState } from '@/context/ai-state-context';
import { useInterrupt } from '@/components/canvas/live2d';
import { useChatHistory } from '@/context/chat-history-context';
import { useVAD } from '@/context/vad-context';
import { useMediaCapture } from '@/hooks/utils/use-media-capture';
import { useProactiveSpeak } from '@/context/proactive-speak-context';
import { audioManager } from '@/utils/audio-manager';

export function useTextInput() {
  const [inputText, setInputText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const wsContext = useWebSocket();
  const { aiState } = useAiState();
  const { interrupt } = useInterrupt();
  const { appendHumanMessage, setAgentStatus } = useChatHistory();
  const { stopMic, autoStopMic } = useVAD();
  const { captureAllMedia, captureSystemAudio } = useMediaCapture();
  const { resetIdleTimer } = useProactiveSpeak();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    resetIdleTimer();
  };

  const handleSend = async () => {
    if (!inputText.trim() || !wsContext) return;
    // Removed: auto-interrupt when AI is speaking.
    // Text input is now queued and plays after the current output.

    // 사용자가 메시지를 전송한 즉시 스피너를 켜서 세션이 처리 중임을 알린다.
    // 백엔드의 conversation-chain-start / agent_status active 이벤트가 도착하면
    // detail이 덮여쓰기되어 자연스럽게 진행 상태로 이어진다.
    setAgentStatus({
      status: 'active',
      detail: '요청 전달 중',
      timestamp: Date.now() / 1000,
    });

    const [images, system_audio] = await Promise.all([
      captureAllMedia(),
      captureSystemAudio(),
    ]);

    appendHumanMessage(inputText.trim());
    wsContext.sendMessage({
      type: 'text-input',
      text: inputText.trim(),
      images,
      system_audio,
      current_volume: Math.round(audioManager.getVolume() * 100),
    });

    if (autoStopMic) stopMic();
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  return {
    inputText,
    setInputText: handleInputChange,
    handleSend,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
  };
}
