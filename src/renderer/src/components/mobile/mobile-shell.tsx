import {
  Box, Flex, HStack, IconButton, Textarea,
} from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Global, css } from '@emotion/react';
import {
  FiMenu, FiMessageSquare, FiSettings, FiSend, FiX, FiPlus,
} from 'react-icons/fi';
import { BsPaperclip } from 'react-icons/bs';
import { IoHandRightSharp } from 'react-icons/io5';
import Background from '@/components/canvas/background';
import Subtitle from '@/components/canvas/subtitle';
import WebSocketStatus from '@/components/canvas/ws-status';
import SessionRail from '@/components/sidebar/session-rail';
import ChatHistoryPanel from '@/components/sidebar/chat-history-panel';
import SettingUI from '@/components/sidebar/setting/setting-ui';
import AIStateIndicator from '@/components/footer/ai-state-indicator';
import AttachmentBar from '@/components/footer/attachment-bar';
import QueuedInputBar from '@/components/footer/queued-input-bar';
import { useFooter } from '@/hooks/footer/use-footer';
import { useSidebar } from '@/hooks/sidebar/use-sidebar';
import { useAttachments } from '@/context/attachment-context';
import { useToolApproval } from '@/context/tool-approval-context';
import { useViewer } from '@/context/viewer-context';
import { useSession } from '@/context/session-context';

/**
 * 모바일(세로 폰) 전용 셸 — 네무린 선택 1번 안
 *
 * 데스크탑은 사이드바 2단 구성이지만 폰에서는 가로가 모자라 채팅이 반토막 나고
 * 푸터 버튼줄이 잘렸다. 그래서 폰에서는 캐릭터를 화면 전체에 깔고, 채팅과 입력을
 * 그 위에 반투명 레이어로 띄운다.
 *
 *  - 상단 바: 세션 레일 토글 / 상태 / 채팅 접기 / 설정 (높이 44px)
 *  - 채팅: 하단에서 올라오는 반투명 패널. 접으면 캐릭터 전체가 보이고 자막만 남는다
 *  - 입력줄: 화면 맨 아래 고정. 소프트 키보드가 올라오면 그만큼 띄워 올린다
 *  - 세션 레일: 상단 바 바로 아래 가로 스트립. 기존 SessionRail 의 base(행) 배치 재사용
 */
const TOP_BAR_HEIGHT = 44;
const SESSION_STRIP_HEIGHT = 60;
const CHAT_OPEN_KEY = 'mobile-chat-open';

/** 채팅 오버레이 안에서는 메시지 목록 배경을 지워 캐릭터가 비쳐 보이게 한다. */
const mobileChatStyles = css`
  /* ChatHistoryPanel 최상위 Box 가 bg=gray.900 으로 못박혀 있어 오버레이가
     불투명해진다. 모바일 셸 안쪽일 때만 걷어낸다. */
  .mizuki-mobile-chat > div {
    background: transparent !important;
  }
  .mizuki-mobile-chat .cs-message-list {
    background: transparent !important;
    padding: 8px 4px !important;
  }
  .mizuki-mobile-chat .cs-main-container {
    width: 100% !important;
  }
  .mizuki-mobile-chat .cs-chat-container {
    border: none !important;
    padding: 0 !important;
  }
  .mizuki-mobile-chat .cs-message__content {
    background-color: rgba(26, 32, 44, 0.78) !important;
    font-size: 0.9rem !important;
  }
  .mizuki-mobile-chat .cs-message--outgoing .cs-message__content {
    background-color: rgba(45, 55, 72, 0.78) !important;
  }
  .mizuki-mobile-chat .cs-message__content-wrapper {
    max-width: 88%;
  }
`;

/**
 * 소프트 키보드가 가린 높이
 *
 * 모바일 브라우저는 키보드가 올라와도 window.innerHeight 를 줄이지 않아서
 * position fixed 요소가 키보드 뒤로 숨는다. visualViewport 로 실제 보이는
 * 높이를 재서 그 차이만큼 입력줄을 올려준다.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      // 1px 단위 떨림과 음수는 무시한다.
      setInset(hidden > 24 ? Math.round(hidden) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}

/** 입력줄 — 첨부, 한 줄 텍스트, 전송, 끼어들기 */
function MobileInputBar({ bottomOffset }: { bottomOffset: number }): JSX.Element {
  const {
    inputValue,
    handleInputChange,
    handleSend,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
  } = useFooter();
  const { addFiles } = useAttachments();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files.length > 0) addFiles(files);
    e.target.value = '';
  };

  return (
    <Box
      position="fixed"
      left="0"
      right="0"
      bottom={`${bottomOffset}px`}
      zIndex={25}
      bg="rgba(17, 20, 28, 0.82)"
      backdropFilter="blur(8px)"
      borderTop="1px solid"
      borderColor="whiteAlpha.200"
      paddingX="8px"
      paddingTop="6px"
      paddingBottom="calc(6px + env(safe-area-inset-bottom))"
      transition="bottom 0.15s ease-out"
    >
      <QueuedInputBar />
      <AttachmentBar />
      <HStack gap="6px" align="flex-end">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilePicked}
        />
        <IconButton
          aria-label="이미지 첨부"
          variant="ghost"
          color="whiteAlpha.800"
          size="sm"
          flexShrink={0}
          onClick={() => fileInputRef.current?.click()}
        >
          <BsPaperclip size="20" />
        </IconButton>
        <Textarea
          value={inputValue}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="메시지 입력"
          rows={1}
          resize="none"
          minH="40px"
          maxH="96px"
          flex={1}
          bg="whiteAlpha.100"
          border="1px solid"
          borderColor="whiteAlpha.300"
          borderRadius="18px"
          paddingX="12px"
          paddingY="9px"
          // 16px 미만이면 iOS 사파리가 입력 포커스 때 화면을 확대해 버린다.
          fontSize="16px"
          color="white"
          _placeholder={{ color: 'whiteAlpha.500' }}
        />
        <IconButton
          aria-label="끼어들기"
          title="끼어들기"
          bg="yellow.600"
          color="white"
          size="sm"
          flexShrink={0}
          borderRadius="full"
          onClick={handleInterrupt}
        >
          <IoHandRightSharp size="18" />
        </IconButton>
        <IconButton
          aria-label="보내기"
          bg="purple.500"
          color="white"
          size="sm"
          flexShrink={0}
          borderRadius="full"
          onClick={() => handleSend()}
        >
          <FiSend size="18" />
        </IconButton>
      </HStack>
    </Box>
  );
}

export default function MobileShell(): JSX.Element {
  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CHAT_OPEN_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [railOpen, setRailOpen] = useState(false);
  const {
    settingsOpen, onSettingsOpen, onSettingsClose, createNewHistory,
  } = useSidebar();
  const { allPass, setAllPass } = useToolApproval();
  const { isOwnerViewer } = useViewer();
  const { supported: sessionSupported } = useSession();
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? 'true' : 'false');
    } catch {
      // 사생활 보호 모드 등에서의 저장 실패는 무시한다.
    }
  }, [chatOpen]);

  const toggleChat = useCallback(() => setChatOpen((prev) => !prev), []);

  // 입력줄 높이는 내용에 따라 변하므로 자막·채팅은 넉넉히 112px 를 비워둔다.
  const inputBarSpace = 112 + keyboardInset;

  if (settingsOpen) {
    return (
      <Box position="fixed" inset="0" zIndex={60} bg="gray.900" overflowY="auto">
        <SettingUI
          open={settingsOpen}
          onClose={onSettingsClose}
          onToggle={onSettingsClose}
        />
      </Box>
    );
  }

  return (
    <>
      <Global styles={mobileChatStyles} />

      {/* 배경 — Live2D(zIndex 5) 보다 아래 */}
      <Box position="fixed" inset="0" zIndex={0}>
        <Background />
      </Box>

      {/* 상단 바 */}
      <Flex
        position="fixed"
        top="0"
        left="0"
        right="0"
        height={`${TOP_BAR_HEIGHT}px`}
        zIndex={30}
        align="center"
        justify="space-between"
        paddingX="6px"
        bg="rgba(17, 20, 28, 0.72)"
        backdropFilter="blur(8px)"
        borderBottom="1px solid"
        borderColor="whiteAlpha.200"
      >
        <HStack gap="0">
          {sessionSupported && (
            <IconButton
              aria-label="세션 목록"
              variant="ghost"
              color="whiteAlpha.900"
              size="sm"
              onClick={() => setRailOpen((prev) => !prev)}
            >
              {railOpen ? <FiX size="18" /> : <FiMenu size="18" />}
            </IconButton>
          )}
          {/* 상태 배지들은 데스크탑 크기 그대로면 좁은 상단 바를 다 먹는다 */}
          <Box transform="scale(0.7)" transformOrigin="left center">
            <WebSocketStatus />
          </Box>
        </HStack>

        <HStack gap="0">
          <Box transform="scale(0.7)" transformOrigin="right center">
            <AIStateIndicator />
          </Box>
          {isOwnerViewer && (
            <Box
              as="button"
              fontSize="11px"
              fontWeight="bold"
              lineHeight="1"
              paddingX="7px"
              paddingY="6px"
              borderRadius="full"
              color="white"
              bg={allPass ? 'green.600' : 'whiteAlpha.200'}
              onClick={() => setAllPass(!allPass)}
              title={allPass ? '권한 요청 자동 허용 중' : '권한 요청 시 팝업 표시'}
            >
              ALL
            </Box>
          )}
          {/* 새 세션 만들기는 세션 레일의 + 버튼이 담당하므로, 여기 + 는
              letta 세션을 쓰지 않는 구성에서만 둔다(상단 바 폭 절약) */}
          {!sessionSupported && (
            <IconButton
              aria-label="새 대화"
              variant="ghost"
              color="whiteAlpha.900"
              size="sm"
              onClick={createNewHistory}
            >
              <FiPlus size="18" />
            </IconButton>
          )}
          <IconButton
            aria-label={chatOpen ? '채팅 접기' : '채팅 펼치기'}
            variant="ghost"
            color={chatOpen ? 'purple.200' : 'whiteAlpha.900'}
            size="sm"
            onClick={toggleChat}
          >
            <FiMessageSquare size="18" />
          </IconButton>
          <IconButton
            aria-label="설정"
            variant="ghost"
            color="whiteAlpha.900"
            size="sm"
            onClick={onSettingsOpen}
          >
            <FiSettings size="18" />
          </IconButton>
        </HStack>
      </Flex>

      {/* 세션 레일 — 상단 바 아래 가로 스트립 */}
      {railOpen && (
        <Box
          position="fixed"
          top={`${TOP_BAR_HEIGHT}px`}
          left="0"
          right="0"
          height={`${SESSION_STRIP_HEIGHT}px`}
          zIndex={29}
          bg="rgba(17, 20, 28, 0.9)"
          backdropFilter="blur(8px)"
          borderBottom="1px solid"
          borderColor="whiteAlpha.200"
          overflow="hidden"
        >
          <SessionRail />
        </Box>
      )}

      {/* 채팅 오버레이 */}
      {chatOpen && (
        <Flex
          className="mizuki-mobile-chat"
          position="fixed"
          left="0"
          right="0"
          bottom={`${inputBarSpace}px`}
          height="min(46vh, 420px)"
          zIndex={20}
          direction="column"
          bg="rgba(13, 16, 23, 0.46)"
          backdropFilter="blur(7px)"
          borderTop="1px solid"
          borderColor="whiteAlpha.200"
          borderTopRadius="14px"
          overflow="hidden"
          transition="bottom 0.15s ease-out"
        >
          <ChatHistoryPanel />
        </Flex>
      )}

      {/* 자막 — 채팅을 접었을 때만 보여준다 */}
      {!chatOpen && (
        <Box
          position="fixed"
          left="50%"
          transform="translateX(-50%)"
          bottom={`${inputBarSpace}px`}
          width="92%"
          zIndex={20}
          pointerEvents="none"
        >
          <Subtitle />
        </Box>
      )}

      <MobileInputBar bottomOffset={keyboardInset} />
    </>
  );
}
