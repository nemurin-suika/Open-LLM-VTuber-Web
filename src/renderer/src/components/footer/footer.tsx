/* eslint-disable react/require-default-props */
import {
  Box, Button, Textarea, IconButton, HStack, VStack,
} from '@chakra-ui/react';
import { BsMicFill, BsMicMuteFill, BsPaperclip, BsVolumeUpFill, BsVolumeMuteFill } from 'react-icons/bs';
import { IoHandRightSharp } from 'react-icons/io5';
import { FiChevronDown } from 'react-icons/fi';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputGroup } from '@/components/ui/input-group';
import { Slider } from '@/components/ui/slider';
import {
  PopoverRoot, PopoverTrigger, PopoverContent, PopoverBody, PopoverArrow,
} from '@/components/ui/popover';
import { audioManager } from '@/utils/audio-manager';
import { resetModelToCenter } from '@/utils/model-movement-animator';
import { LuCrosshair } from 'react-icons/lu';
import { footerStyles } from './footer-styles';
import AIStateIndicator from './ai-state-indicator';
import QueuedInputBar from './queued-input-bar';
import AttachmentBar from './attachment-bar';
import { useFooter } from '@/hooks/footer/use-footer';
import { useAttachments } from '@/context/attachment-context';
import { useToolApproval } from '@/context/tool-approval-context';
import { useViewer } from '@/context/viewer-context';

// Type definitions
interface FooterProps {
  isCollapsed?: boolean
  onToggle?: () => void
}

interface ToggleButtonProps {
  isCollapsed: boolean
  onToggle?: () => void
}

interface ActionButtonsProps {
  micOn: boolean
  onMicToggle: () => void
  onInterrupt: () => void
  voiceInputSuspended?: boolean
}

interface VolumeControlProps {
  volume: number
  onVolumeChange: (value: number) => void
}

interface MessageInputProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
}

// Reusable components
const ToggleButton = memo(({ isCollapsed, onToggle }: ToggleButtonProps) => (
  <Box
    {...footerStyles.footer.toggleButton}
    onClick={onToggle}
    color="whiteAlpha.500"
    style={{
      transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
    }}
  >
    <FiChevronDown />
  </Box>
));

ToggleButton.displayName = 'ToggleButton';

const VolumeControl = memo(({ volume, onVolumeChange }: VolumeControlProps) => {
  const { t } = useTranslation();
  return (
    <PopoverRoot positioning={{ placement: 'top' }}>
      <PopoverTrigger asChild>
        <IconButton
          aria-label={t('footer.volumeControl')}
          bg="gray.600"
          {...footerStyles.footer.actionButton}
        >
          {volume === 0 ? <BsVolumeMuteFill size="20" /> : <BsVolumeUpFill size="20" />}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent bg="gray.800" borderColor="whiteAlpha.200" width="160px">
        <PopoverArrow />
        <PopoverBody py={4} px={4}>
          <VStack gap={2} align="stretch">
            <Box color="whiteAlpha.700" fontSize="xs" textAlign="center">
              {t('footer.volume')}: {Math.round(volume * 100)}%
            </Box>
            <Slider
              value={[volume * 100]}
              min={0}
              max={100}
              step={1}
              colorPalette="blue"
              onValueChange={(details) => onVolumeChange(details.value[0] / 100)}
            />
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </PopoverRoot>
  );
});

VolumeControl.displayName = 'VolumeControl';

const ActionButtons = memo(({
  micOn, onMicToggle, onInterrupt, voiceInputSuspended = false,
}: ActionButtonsProps) => (
  <HStack gap={2}>
    <IconButton
      aria-label="음성 입력"
      title={voiceInputSuspended && !micOn
        ? '음성 입력은 일시적으로 지원하지 않습니다'
        : '음성 입력 켜기/끄기'}
      bg={micOn ? 'green.500' : 'red.500'}
      opacity={voiceInputSuspended && !micOn ? 0.6 : 1}
      {...footerStyles.footer.actionButton}
      onClick={onMicToggle}
    >
      {micOn ? <BsMicFill /> : <BsMicMuteFill />}
    </IconButton>
    <IconButton
      aria-label="Raise hand"
      bg="yellow.500"
      {...footerStyles.footer.actionButton}
      onClick={onInterrupt}
    >
      <IoHandRightSharp size="24" />
    </IconButton>
  </HStack>
));

ActionButtons.displayName = 'ActionButtons';

const MessageInput = memo(({
  value,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: MessageInputProps) => {
  const { t } = useTranslation();
  const { addFiles } = useAttachments();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 파일 선택 — 같은 파일을 연달아 고를 수 있도록 value 를 비운다.
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files.length > 0) addFiles(files);
    e.target.value = '';
  };

  // 스크린샷을 클립보드에 담아 바로 붙여넣는 경로. 이미지가 있을 때만 가로챈다.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const images = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (images.length === 0) return;
    e.preventDefault();
    addFiles(images);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer?.files || []);
    setIsDragOver(false);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  };

  return (
    <InputGroup flex={1}>
      <Box
        position="relative"
        width="100%"
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
            e.preventDefault();
            setIsDragOver(true);
          }
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        outline={isDragOver ? '2px solid' : undefined}
        outlineColor={isDragOver ? 'purple.300' : undefined}
        borderRadius="lg"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilePicked}
        />
        <IconButton
          aria-label="Attach file"
          title="이미지 첨부 (붙여넣기·드래그도 가능)"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          {...footerStyles.footer.attachButton}
        >
          <BsPaperclip size="24" />
        </IconButton>
        <Textarea
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder={t('footer.typeYourMessage')}
          {...footerStyles.footer.input}
        />
      </Box>
    </InputGroup>
  );
});

MessageInput.displayName = 'MessageInput';

// Main component
function Footer({ isCollapsed = false, onToggle }: FooterProps): JSX.Element {
  const { allPass, setAllPass } = useToolApproval();
  // TODO2 1-10: 도구 승인은 주인만 다룬다. 손님에게는 버튼 자체를 숨긴다
  const { isOwnerViewer } = useViewer();
  const {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    micOn,
    voiceInputSuspended,
  } = useFooter();

  const [volume, setVolume] = useState(() => audioManager.getVolume());

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    audioManager.setVolume(newVolume);
  };

  return (
    <Box {...footerStyles.footer.container(isCollapsed)}>
      <ToggleButton isCollapsed={isCollapsed} onToggle={onToggle} />

      <Box pt="0" px="4">
        <HStack width="100%" gap={4}>
          <Box>
            <Box mb="1.5">
              <AIStateIndicator />
            </Box>
            <HStack gap={2}>
              <ActionButtons
                micOn={micOn}
                onMicToggle={handleMicToggle}
                onInterrupt={handleInterrupt}
                voiceInputSuspended={voiceInputSuspended}
              />
              <VolumeControl volume={volume} onVolumeChange={handleVolumeChange} />
              <IconButton
                aria-label="Reset model position"
                bg="gray.600"
                title="Reset model position and scale to center"
                onClick={resetModelToCenter}
                {...footerStyles.footer.actionButton}
              >
                <LuCrosshair size="20" />
              </IconButton>
            </HStack>
          </Box>

          <VStack flex={1} gap="1.5" align="stretch">
            {/* 아직 미즈키에게 전달되지 않은 입력 — 큐가 비면 렌더되지 않는다 */}
            <QueuedInputBar />
            {/* 전송 대기 중인 첨부 이미지 — 첨부가 없으면 렌더되지 않는다 */}
            <AttachmentBar />
            <HStack gap={2} align="stretch">
              <MessageInput
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyPress}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
              />
              {isOwnerViewer && (
                <Button
                  aria-label="권한 요청 모두 허용"
                  aria-pressed={allPass}
                  title={allPass ? '권한 요청 자동 허용 중' : '권한 요청 시 팝업 표시'}
                  bg={allPass ? 'green.600' : 'gray.600'}
                  color="white"
                  height="80px"
                  px="3"
                  flexShrink={0}
                  onClick={() => setAllPass(!allPass)}
                >
                  ALL PASS {allPass ? 'ON' : 'OFF'}
                </Button>
              )}
            </HStack>
          </VStack>
        </HStack>
      </Box>
    </Box>
  );
}

export default Footer;
