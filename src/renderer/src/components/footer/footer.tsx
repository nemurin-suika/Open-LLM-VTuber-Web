/* eslint-disable react/require-default-props */
import {
  Box, Textarea, IconButton, HStack, VStack,
} from '@chakra-ui/react';
import { BsMicFill, BsMicMuteFill, BsPaperclip, BsVolumeUpFill, BsVolumeMuteFill } from 'react-icons/bs';
import { IoHandRightSharp } from 'react-icons/io5';
import { FiChevronDown } from 'react-icons/fi';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputGroup } from '@/components/ui/input-group';
import { Slider } from '@/components/ui/slider';
import {
  PopoverRoot, PopoverTrigger, PopoverContent, PopoverBody, PopoverArrow,
} from '@/components/ui/popover';
import { audioManager } from '@/utils/audio-manager';
import { footerStyles } from './footer-styles';
import AIStateIndicator from './ai-state-indicator';
import { useFooter } from '@/hooks/footer/use-footer';

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

const ActionButtons = memo(({ micOn, onMicToggle, onInterrupt }: ActionButtonsProps) => (
  <HStack gap={2}>
    <IconButton
      bg={micOn ? 'green.500' : 'red.500'}
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

  return (
    <InputGroup flex={1}>
      <Box position="relative" width="100%">
        <IconButton
          aria-label="Attach file"
          variant="ghost"
          {...footerStyles.footer.attachButton}
        >
          <BsPaperclip size="24" />
        </IconButton>
        <Textarea
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
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
  const {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    micOn,
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
              />
              <VolumeControl volume={volume} onVolumeChange={handleVolumeChange} />
            </HStack>
          </Box>

          <MessageInput
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
        </HStack>
      </Box>
    </Box>
  );
}

export default Footer;
