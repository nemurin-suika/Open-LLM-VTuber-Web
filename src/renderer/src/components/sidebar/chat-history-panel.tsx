/* eslint-disable function-paren-newline */
/* eslint-disable react/jsx-one-expression-per-line */
/* eslint-disable no-trailing-spaces */
/* eslint-disable no-nested-ternary */
/* eslint-disable import/order */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable react/require-default-props */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Spinner, Flex, Text, Icon } from '@chakra-ui/react';
import { sidebarStyles, chatPanelStyles } from './sidebar-styles';
import { MainContainer, ChatContainer, MessageList as ChatMessageList, Message as ChatMessage, Avatar as ChatAvatar } from '@chatscope/chat-ui-kit-react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import { useChatHistory } from '@/context/chat-history-context';
import { Global } from '@emotion/react';
import { useConfig } from '@/context/character-config-context';
import { useWebSocket } from '@/context/websocket-context';
import { useSession } from '@/context/session-context';
import { FaTools, FaCheck, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { LinkifiedText } from '@/components/ui/linkified-text';

/** 위로 스크롤 추가 로드로 한 번에 가져올 과거 메시지 개수 */
const LOAD_MORE_LIMIT = 50;

// Main component
function ChatHistoryPanel(): JSX.Element {
  const { t } = useTranslation();
  const {
    messages, agentStatus, historyCursor, setHistoryCursor,
  } = useChatHistory(); // Get messages directly from context
  const { confName, characterName, humanName } = useConfig();
  const { baseUrl, sendMessage } = useWebSocket();
  const { activeSessionId } = useSession();
  // 화자 표시 이름. character_name/human_name(conf.yaml)이 우선,
  // 없으면 설정파일 이름(confName)으로 폴백한다.
  const aiName = characterName || confName || 'AI';
  const userName = humanName || 'Me';

  // 클릭한 이미지 확대 표시용 상태. src와 label(파일명 등)을 함께 저장한다.
  const [enlargedImage, setEnlargedImage] = useState<{ src: string; label?: string } | null>(null);

  // --- 위로 스크롤 추가 로드 (TODO19 6단계) -------------------------------
  // 과거 메시지를 앞쪽에 덧붙이면 스크롤 위치가 그만큼 밀려 올라가므로,
  // 요청 직전의 scrollHeight 를 기억해 두고 도착 후 차이만큼 scrollTop 을 보정한다.
  const pendingScrollRef = useRef<{ el: HTMLDivElement; prevHeight: number } | null>(null);
  // historyCursor 를 콜백 의존성에서 떼어내기 위한 최신값 보관.
  const cursorRef = useRef(historyCursor);
  cursorRef.current = historyCursor;

  const handleYReachStart = useCallback((container: HTMLDivElement) => {
    const cursor = cursorRef.current;
    if (!cursor.hasMore || cursor.loading || !cursor.oldestId) return;
    // 마운트 직후(스크롤이 거의 없는 상태)의 오인 발동을 막는다.
    if (container.scrollHeight <= container.clientHeight) return;
    pendingScrollRef.current = { el: container, prevHeight: container.scrollHeight };
    setHistoryCursor((prev) => ({ ...prev, loading: true }));
    sendMessage({
      type: 'fetch-letta-history',
      limit: LOAD_MORE_LIMIT,
      before: cursor.oldestId,
      conversation_id: activeSessionId,
    });
  }, [sendMessage, setHistoryCursor, activeSessionId]);

  useEffect(() => {
    // 로드가 끝난 뒤(loading=false)에만 보정한다. 결과가 비어 있어도 ref 는 비워 준다.
    if (historyCursor.loading) return;
    const pending = pendingScrollRef.current;
    if (!pending) return;
    pendingScrollRef.current = null;
    const grown = pending.el.scrollHeight - pending.prevHeight;
    if (grown > 0) pending.el.scrollTop += grown;
  }, [messages.length, historyCursor.loading]);

  // Esc 키로 확대 뷰 닫기
  useEffect(() => {
    if (!enlargedImage) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlargedImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enlargedImage]);

  const validMessages = messages.filter((msg) => msg.content || // Keep messages with content
     (msg.type === 'tool_call_status' && msg.status === 'running') || // Keep running tools
     (msg.type === 'tool_call_status' && msg.status === 'completed') || // Keep completed tools
     (msg.type === 'tool_call_status' && msg.status === 'error') || // Keep error tools
     msg.type === 'progress_update' || // Keep progress updates
     msg.type === 'image_display', // Keep image display messages (explicit, not via msg.content fallback)
  );

  return (
    <Box
      h="full"
      overflow="hidden"
      bg="gray.900"
    >
      <Global styles={chatPanelStyles} />
      <MainContainer>
        <ChatContainer>
          <ChatMessageList
            loadingMore={historyCursor.loading}
            loadingMorePosition="top"
            onYReachStart={handleYReachStart}
            disableOnYReachWhenNoScroll
          >
            {validMessages.length === 0 ? (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                height="100%"
                color="whiteAlpha.500"
                fontSize="sm"
              >
                {t('sidebar.noMessages')}
              </Box>
            ) : (
              validMessages.map((msg) => {
                // Check if it's a progress update message
                if (msg.type === 'progress_update') {
                  return (
                    <Flex key={msg.id} align="center" gap={2} px={2} py={1} opacity={0.7}>
                      <Box w={2} h={2} borderRadius="full" bg="purple.400" flexShrink={0} />
                      <Text fontSize="xs" color="purple.600" fontStyle="italic">
                        <LinkifiedText text={msg.content} />
                      </Text>
                    </Flex>
                  );
                }
                // Check if it's an image display message
                if (msg.type === 'image_display' && msg.image_base64 && msg.mime_type) {
                  const imgSrc = `data:${msg.mime_type};base64,${msg.image_base64}`;
                  return (
                    <Box key={msg.id} px={2} py={1}>
                      <img
                        src={imgSrc}
                        alt={msg.image_label || '이미지'}
                        onClick={() => setEnlargedImage({ src: imgSrc, label: msg.image_label })}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '240px',
                          borderRadius: '8px',
                          objectFit: 'contain',
                          cursor: 'zoom-in',
                        }}
                      />
                      {msg.image_label && (
                        <Text fontSize="xs" color="gray.500" mt={1} noOfLines={1} title={msg.image_label}>
                          {msg.image_label}
                        </Text>
                      )}
                    </Box>
                  );
                }
                // Check if it's a tool call message
                if (msg.type === 'tool_call_status') {
                  return (
                    // Render Tool Call Indicator using msg properties
                    <Flex
                      key={msg.id} // Use tool_id as key
                      {...sidebarStyles.toolCallIndicator.container}
                      alignItems="center"
                    >
                      <Icon
                        as={FaTools}
                        {...sidebarStyles.toolCallIndicator.icon}
                      />
                      <Text {...sidebarStyles.toolCallIndicator.text}>
                        {/* {msg.tool_name}: {msg.status === 'running' ? 'Running...' : msg.content} */}
                        {msg.status === "running" ? `${msg.name} is using tool ${msg.tool_name}` : `${msg.name} used tool ${msg.tool_name}`}
                      </Text>
                      {/* Show spinner if running, checkmark if completed, maybe error icon? */}
                      {msg.status === "running" && (
                        <Spinner
                          size="xs"
                          color={sidebarStyles.toolCallIndicator.spinner.color}
                          ml={sidebarStyles.toolCallIndicator.spinner.ml}
                        />
                      )}
                      {msg.status === "completed" && (
                        <Icon
                          as={FaCheck}
                          {...sidebarStyles.toolCallIndicator.completedIcon}
                        />
                      )}
                      {/* Optional: Add an error icon */}
                      {msg.status === "error" && (
                        <Icon
                          as={FaTimes}
                          {...sidebarStyles.toolCallIndicator.errorIcon}
                        />
                      )}
                    </Flex>
                  );
                } 
                // Render Standard Chat Message (human or ai text)
                return (
                  <ChatMessage
                    key={msg.id}
                    model={{
                      type: 'custom',
                      sentTime: msg.timestamp,
                      sender: msg.role === 'ai'
                        ? (msg.name || aiName)
                        : userName,
                      direction: msg.role === 'ai' ? 'incoming' : 'outgoing',
                      position: 'single',
                    }}
                    avatarPosition={msg.role === 'ai' ? 'tl' : 'tr'}
                    avatarSpacer={false}
                  >
                    <ChatMessage.CustomContent>
                      <LinkifiedText text={msg.content} />
                    </ChatMessage.CustomContent>
                    <ChatAvatar>
                      {msg.role === 'ai' ? (
                        msg.avatar ? (
                          <img
                            src={`${baseUrl}/avatars/${msg.avatar}`}
                            alt="avatar"
                            style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const fallbackName = msg.name || aiName;
                              target.outerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%; background-color: var(--chakra-colors-blue-500); color: white; font-size: 14px;">${fallbackName[0].toUpperCase()}</div>`;
                            }}
                          />
                        ) : (
                          (msg.name && msg.name[0].toUpperCase()) ||
                            aiName[0].toUpperCase()
                        )
                      ) : (
                        userName[0].toUpperCase()
                      )}
                    </ChatAvatar>
                  </ChatMessage>
                );
              })
            )}
            {agentStatus.status === 'active' && (
              <Flex
                align="center"
                gap={2}
                px={3}
                py={2}
                mt={1}
                borderRadius="md"
                bg="whiteAlpha.100"
              >
                <Spinner size="xs" color="purple.300" />
                <Text fontSize="xs" color="whiteAlpha.800" fontStyle="italic">
                  {agentStatus.detail
                    ? `미즈키 ${agentStatus.detail}`
                    : '미즈키 응답 준비 중'}
                </Text>
              </Flex>
            )}
          </ChatMessageList>
        </ChatContainer>
      </MainContainer>

      {enlargedImage && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.800"
          zIndex={9999}
          display="flex"
          alignItems="center"
          justifyContent="center"
          onClick={() => setEnlargedImage(null)}
          cursor="zoom-out"
        >
          <Box
            position="relative"
            w="95vw"
            h="95vh"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={enlargedImage.src}
              alt={enlargedImage.label || '이미지 확대'}
              style={{
                maxWidth: '100%',
                maxHeight: enlargedImage.label ? 'calc(100% - 40px)' : '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              }}
            />
            {enlargedImage.label && (
              <Text mt={2} fontSize="sm" color="whiteAlpha.900" textAlign="center" maxW="90vw" noOfLines={2}>
                {enlargedImage.label}
              </Text>
            )}
            <Text
              position="absolute"
              top={2}
              right={3}
              fontSize="xl"
              color="whiteAlpha.900"
              cursor="pointer"
              userSelect="none"
              onClick={() => setEnlargedImage(null)}
              title="닫기 (Esc)"
            >
              ×
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default ChatHistoryPanel;
