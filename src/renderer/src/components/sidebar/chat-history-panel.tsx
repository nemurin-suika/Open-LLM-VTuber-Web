/* eslint-disable function-paren-newline */
/* eslint-disable react/jsx-one-expression-per-line */
/* eslint-disable no-trailing-spaces */
/* eslint-disable no-nested-ternary */
/* eslint-disable import/order */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable react/require-default-props */
import React, { useEffect, useState } from 'react';
import { Box, Spinner, Flex, Text, Icon } from '@chakra-ui/react';
import { sidebarStyles, chatPanelStyles } from './sidebar-styles';
import { MainContainer, ChatContainer, MessageList as ChatMessageList, Message as ChatMessage, Avatar as ChatAvatar } from '@chatscope/chat-ui-kit-react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import { useChatHistory } from '@/context/chat-history-context';
import { Global } from '@emotion/react';
import { useConfig } from '@/context/character-config-context';
import { useWebSocket } from '@/context/websocket-context';
import { FaTools, FaCheck, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

// Main component
function ChatHistoryPanel(): JSX.Element {
  const { t } = useTranslation();
  const { messages, agentStatus } = useChatHistory(); // Get messages directly from context
  const { confName } = useConfig();
  const { baseUrl } = useWebSocket();
  const userName = "Me";

  // 클릭한 이미지 확대 표시용 상태. src와 label(파일명 등)을 함께 저장한다.
  const [enlargedImage, setEnlargedImage] = useState<{ src: string; label?: string } | null>(null);

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
          <ChatMessageList>
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
                        {msg.content}
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
                      message: msg.content,
                      sentTime: msg.timestamp,
                      sender: msg.role === 'ai'
                        ? (msg.name || confName || 'AI')
                        : userName,
                      direction: msg.role === 'ai' ? 'incoming' : 'outgoing',
                      position: 'single',
                    }}
                    avatarPosition={msg.role === 'ai' ? 'tl' : 'tr'}
                    avatarSpacer={false}
                  >
                    <ChatAvatar>
                      {msg.role === 'ai' ? (
                        msg.avatar ? (
                          <img
                            src={`${baseUrl}/avatars/${msg.avatar}`}
                            alt="avatar"
                            style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const fallbackName = msg.name || confName || 'A';
                              target.outerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%; background-color: var(--chakra-colors-blue-500); color: white; font-size: 14px;">${fallbackName[0].toUpperCase()}</div>`;
                            }}
                          />
                        ) : (
                          (msg.name && msg.name[0].toUpperCase()) ||
                            (confName && confName[0].toUpperCase()) ||
                            'A'
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
