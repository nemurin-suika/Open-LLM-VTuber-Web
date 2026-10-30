import { useVAD } from '@/context/vad-context';
import { useAiState } from '@/context/ai-state-context';
import { toaster } from '@/components/ui/toaster';

// 음성 입력(VAD + ASR)은 현재 일시 중단 상태.
// 버튼을 눌러도 마이크를 켜지 않고 안내 팝업만 띄운다.
// 다시 지원하게 되면 이 상수만 false 로 돌리면 원래 동작으로 복귀한다.
const VOICE_INPUT_SUSPENDED = true;

const VOICE_INPUT_SUSPENDED_MESSAGE = '일시적인 문제로 음성 입력을 지원하지 않습니다. 아래 입력창에 텍스트로 말씀해 주세요.';

export function useMicToggle() {
  const { startMic, stopMic, micOn } = useVAD();
  const { aiState, setAiState } = useAiState();

  const handleMicToggle = async (): Promise<void> => {
    if (micOn) {
      stopMic();
      if (aiState === 'listening') {
        setAiState('idle');
      }
      return;
    }

    if (VOICE_INPUT_SUSPENDED) {
      toaster.create({
        title: VOICE_INPUT_SUSPENDED_MESSAGE,
        type: 'warning',
        duration: 5000,
      });
      return;
    }

    await startMic();
  };

  return {
    handleMicToggle,
    micOn,
    voiceInputSuspended: VOICE_INPUT_SUSPENDED,
  };
}
