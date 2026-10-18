/* eslint-disable */
import { Box, Text, Button, HStack } from '@chakra-ui/react';
import { FiVolume2, FiVolumeX, FiRefreshCw } from 'react-icons/fi';
import { Tooltip } from '@/components/ui/tooltip';
import { sidebarStyles } from './sidebar-styles';
import { useSystemAudioContext } from '@/context/system-audio-context';
import {
  SYSTEM_AUDIO_BUFFER_SECONDS_KEY,
  DEFAULT_SYSTEM_AUDIO_BUFFER_SECONDS,
  SYSTEM_AUDIO_SEND_SECONDS_KEY,
  DEFAULT_SYSTEM_AUDIO_SEND_SECONDS,
} from '@/hooks/sidebar/setting/use-general-settings';

function readSeconds(key: string, fallback: number): number {
  const v = localStorage.getItem(key);
  if (!v) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function SystemAudioPanel(): JSX.Element {
  const {
    isCapturing, hasAudioTrack, error,
    canSelectDevice, inputDevices, selectedDeviceId, setSelectedDeviceId, refreshDevices,
    startCapture, stopCapture,
  } = useSystemAudioContext();

  // 브라우저로 접속한 경우에는 장치를 고르지 않으면 화면 공유 권한 창으로 오디오를 받는다
  const isBrowser = window.electron === undefined;

  const bufferSec = readSeconds(
    SYSTEM_AUDIO_BUFFER_SECONDS_KEY,
    DEFAULT_SYSTEM_AUDIO_BUFFER_SECONDS,
  );
  const sendSec = Math.min(
    readSeconds(SYSTEM_AUDIO_SEND_SECONDS_KEY, DEFAULT_SYSTEM_AUDIO_SEND_SECONDS),
    bufferSec,
  );

  const toggle = () => {
    if (isCapturing) stopCapture();
    else startCapture();
  };

  return (
    <Box {...sidebarStyles.screenPanel.container}>
      <Box {...sidebarStyles.screenPanel.header}>
        {isCapturing && (
          <Box color="green.400" display="flex" alignItems="center" gap={2}>
            <Box
              w="8px"
              h="8px"
              borderRadius="full"
              bg="green.400"
              animation="pulse 2s infinite"
            />
            <Text fontSize="sm">{`시스템 오디오 녹음 중 (최근 ${bufferSec}초)`}</Text>
          </Box>
        )}
      </Box>

      {canSelectDevice && (
        <Box mb={3}>
          <HStack mb={2} justifyContent="space-between">
            <Text fontSize="xs" color="whiteAlpha.700">
              입력 장치 (BlackHole 등)
            </Text>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => refreshDevices(true)}
              disabled={isCapturing}
            >
              <FiRefreshCw />
            </Button>
          </HStack>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={isCapturing}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              color: 'white',
              padding: '8px',
              borderRadius: '6px',
              fontSize: '14px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <option value="" style={{ background: '#2D3748' }}>
              {isBrowser ? '— 화면 공유로 받기 —' : '— 장치 선택 —'}
            </option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId} style={{ background: '#2D3748' }}>
                {d.label || `장치 ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <Text fontSize="xs" color="whiteAlpha.500" mt={1}>
            {isBrowser
              ? '장치를 고르지 않으면 켤 때 화면 공유 창이 떠서, 공유할 탭이나 화면을 고르고 오디오 공유를 켜면 됩니다. 같은 컴퓨터에서 쓸 때는 BlackHole 같은 가상 오디오 장치를 골라도 됩니다.'
              : '시스템 오디오를 캡처하려면 BlackHole(또는 가상 오디오 장치)을 입력으로 선택. macOS 시스템 출력을 Multi-Output Device(스피커 + BlackHole)로 설정해야 소리가 들어옵니다.'}
          </Text>
        </Box>
      )}

      <Tooltip
        showArrow
        content={
          isCapturing
            ? '시스템 오디오 녹음 정지'
            : `시스템 오디오 녹음 시작 (메시지 전송 시 최근 ${sendSec}초 분석)`
        }
      >
        <Box
          {...sidebarStyles.screenPanel.screenContainer}
          onClick={toggle}
          cursor="pointer"
          flexDirection="column"
          gap={2}
          _hover={{ bg: 'whiteAlpha.100' }}
        >
          {error ? (
            <Text color="red.300" fontSize="sm" textAlign="center" px={4}>
              {error}
            </Text>
          ) : isCapturing ? (
            <>
              <FiVolume2 size={32} color="#48BB78" />
              <Text color="whiteAlpha.700" fontSize="sm">
                {hasAudioTrack ? '녹음 중' : '오디오 트랙 없음'}
              </Text>
              <Text color="whiteAlpha.500" fontSize="xs">
                클릭해서 정지
              </Text>
            </>
          ) : (
            <>
              <FiVolumeX size={32} />
              <Text color="whiteAlpha.600" fontSize="sm" textAlign="center">
                시스템 오디오 캡처
              </Text>
              <Text color="whiteAlpha.500" fontSize="xs" textAlign="center" px={4}>
                클릭해서 녹음 시작
              </Text>
            </>
          )}
        </Box>
      </Tooltip>
    </Box>
  );
}

export default SystemAudioPanel;
