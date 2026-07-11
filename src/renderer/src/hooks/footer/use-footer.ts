import { ChangeEvent, KeyboardEvent } from 'react';
import { useVAD } from '@/context/vad-context';
import { useTextInput } from '@/hooks/footer/use-text-input';
import { useInterrupt } from '@/hooks/utils/use-interrupt';
import { useMicToggle } from '@/hooks/utils/use-mic-toggle';
import { useAiState, AiStateEnum } from '@/context/ai-state-context';
import { useTriggerSpeak } from '@/hooks/utils/use-trigger-speak';
import { useProactiveSpeak } from '@/context/proactive-speak-context';

export const useFooter = () => {
  const {
    inputText: inputValue,
    setInputText: handleChange,
    handleKeyPress: handleKey,
    handleCompositionStart,
    handleCompositionEnd,
  } = useTextInput();

  const { interrupt } = useInterrupt();
  const { startMic, autoStartMicOn } = useVAD();
  const { handleMicToggle, micOn } = useMicToggle();
  const { setAiState, aiState } = useAiState();
  const { sendTriggerSignal } = useTriggerSpeak();
  const { settings } = useProactiveSpeak();

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    handleChange({ target: { value: e.target.value } } as ChangeEvent<HTMLInputElement>);
    setAiState(AiStateEnum.WAITING);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    handleKey(e as any);
  };

  const handleInterrupt = () => {
    if (aiState === AiStateEnum.THINKING_SPEAKING || aiState === AiStateEnum.IDLE) {
      interrupt();
      // 마이크 자동 시작은 실제로 말하고 있는 thinking-speaking 상태에서만
      if (autoStartMicOn && aiState === AiStateEnum.THINKING_SPEAKING) {
        startMic();
      }
    } else if (settings.allowButtonTrigger) {
      sendTriggerSignal(-1);
    }
  };

  return {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    micOn,
  };
};
