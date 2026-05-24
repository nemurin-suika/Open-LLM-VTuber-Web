/* eslint-disable */
import { Box, Text, Button, HStack } from '@chakra-ui/react';
import { FiVolume2, FiVolumeX, FiRefreshCw } from 'react-icons/fi';
import { Tooltip } from '@/components/ui/tooltip';
import { sidebarStyles } from './sidebar-styles';
import { useSystemAudioContext } from '@/context/system-audio-context';

function SystemAudioPanel(): JSX.Element {
  const {
    isCapturing, hasAudioTrack, error,
    isMac, inputDevices, selectedDeviceId, setSelectedDeviceId, refreshDevices,
    startCapture, stopCapture,
  } = useSystemAudioContext();

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
            <Text fontSize="sm">시스템 오디오 녹음 중 (최근 60초)</Text>
          </Box>
        )}
      </Box>

      {isMac && (
        <Box mb={3}>
          <HStack mb={2} justifyContent="space-between">
            <Text fontSize="xs" color="whiteAlpha.700">
              입력 장치 (BlackHole 등)
            </Text>
            <Button
              size="xs"
              variant="ghost"
              onClick={refreshDevices}
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
            <option value="" style={{ background: '#2D3748' }}>— 장치 선택 —</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId} style={{ background: '#2D3748' }}>
                {d.label || `장치 ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <Text fontSize="xs" color="whiteAlpha.500" mt={1}>
            시스템 오디오를 캡처하려면 BlackHole(또는 가상 오디오 장치)을 입력으로 선택.
            macOS 시스템 출력을 Multi-Output Device(스피커 + BlackHole)로 설정해야 소리가 들어옵니다.
          </Text>
        </Box>
      )}

      <Tooltip
        showArrow
        content={
          isCapturing
            ? '시스템 오디오 녹음 정지'
            : '시스템 오디오 녹음 시작 (메시지 전송 시 최근 10초 분석)'
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
