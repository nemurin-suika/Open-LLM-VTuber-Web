import { Box, Flex, Text } from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { Tooltip } from '@/components/ui/tooltip';
import {
  useSessionRail, sessionLabel, sessionName, sessionGist,
} from '@/hooks/sidebar/use-session-rail';

/**
 * 디스코드 서버 목록 스타일의 세로 세션 레일 (TODO19 2단계)
 *
 *  - 맨 위 + 버튼 = 새 세션
 *  - 아이콘 하나 = letta conversation 하나, 클릭하면 그 세션으로 이동
 *  - 호버하면 오른쪽에 세션 요약 툴팁
 *  - 비활성 세션의 발화가 끝나 있으면 왼쪽에 작은 점 (미확인 표시)
 *  - 우클릭 삭제, 더블클릭 이름 변경 (메인 세션은 둘 다 불가)
 */
export const SESSION_RAIL_WIDTH = 72;

function SessionDot() {
  return (
    <Box
      position="absolute"
      left="-6px"
      top="50%"
      transform="translateY(-50%)"
      w="8px"
      h="8px"
      borderRadius="full"
      bg="white"
    />
  );
}

function ActivePill() {
  return (
    <Box
      position="absolute"
      left="-10px"
      top="50%"
      transform="translateY(-50%)"
      w="4px"
      h="32px"
      borderRadius="full"
      bg="white"
    />
  );
}

export default function SessionRail(): JSX.Element | null {
  const {
    sessions, activeSessionId, unreadIds, supported,
    switchTo, createSession, deleteSession, renameSession,
  } = useSessionRail();

  if (!supported) return null;

  return (
    <Flex
      direction={{ base: 'row', md: 'column' }}
      align="center"
      gap="10px"
      flexShrink={0}
      width={{ base: '100%', md: `${SESSION_RAIL_WIDTH}px` }}
      height={{ base: '60px', md: '100%' }}
      bg="gray.900"
      borderRight={{ base: 'none', md: '1px solid' }}
      borderBottom={{ base: '1px solid', md: 'none' }}
      borderColor="whiteAlpha.200"
      paddingY={{ base: '0', md: '12px' }}
      paddingX={{ base: '12px', md: '0' }}
      overflowX={{ base: 'auto', md: 'hidden' }}
      overflowY={{ base: 'hidden', md: 'auto' }}
      css={{
        '&::-webkit-scrollbar': { width: '0px', height: '0px' },
      }}
    >
      <Tooltip
        content="새 세션"
        positioning={{ placement: 'right' }}
        openDelay={200}
        portalled
      >
        <Flex
          as="button"
          align="center"
          justify="center"
          flexShrink={0}
          w="48px"
          h="48px"
          borderRadius="16px"
          bg="whiteAlpha.100"
          color="green.300"
          transition="all 0.15s"
          _hover={{ bg: 'green.600', color: 'white', borderRadius: '14px' }}
          onClick={createSession}
        >
          <FiPlus size={22} />
        </Flex>
      </Tooltip>

      <Box
        flexShrink={0}
        w={{ base: '1px', md: '32px' }}
        h={{ base: '32px', md: '1px' }}
        bg="whiteAlpha.300"
      />

      {sessions.map((session, index) => {
        const isActive = session.id === activeSessionId;
        const hasUnread = unreadIds.includes(session.id);
        return (
          <Tooltip
            key={session.id}
            content={(
              <Box maxW="240px">
                <Text fontSize="13px" fontWeight="bold" lineHeight="1.3">
                  {sessionName(session, index)}
                </Text>
                {sessionGist(session) && (
                  <Text fontSize="12px" opacity={0.8} mt="2px" lineHeight="1.35">
                    {sessionGist(session)}
                  </Text>
                )}
              </Box>
            )}
            positioning={{ placement: 'right' }}
            openDelay={200}
            portalled
          >
            <Box position="relative" flexShrink={0}>
              {isActive && <ActivePill />}
              {!isActive && hasUnread && <SessionDot />}
              <Flex
                as="button"
                align="center"
                justify="center"
                w="48px"
                h="48px"
                borderRadius={isActive ? '14px' : '24px'}
                bg={isActive ? 'purple.500' : 'whiteAlpha.200'}
                color="white"
                transition="all 0.15s"
                _hover={{ borderRadius: '14px', bg: isActive ? 'purple.500' : 'purple.400' }}
                onClick={() => switchTo(session.id)}
                onDoubleClick={() => {
                  // eslint-disable-next-line no-alert
                  const next = window.prompt('세션 이름', sessionName(session, index));
                  if (next !== null) renameSession(session.id, next);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (session.is_default) return;
                  // eslint-disable-next-line no-alert
                  if (window.confirm(`세션 "${sessionName(session, index)}" 을 삭제할까?`)) {
                    deleteSession(session.id);
                  }
                }}
              >
                <Text fontSize="13px" fontWeight="bold" lineHeight="1">
                  {sessionLabel(session, index)}
                </Text>
              </Flex>
            </Box>
          </Tooltip>
        );
      })}
    </Flex>
  );
}
