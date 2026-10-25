import { Box, Flex, Text } from '@chakra-ui/react';
import { FiX } from 'react-icons/fi';
import { useQueuedInputs } from '@/hooks/footer/use-queued-inputs';

/** 바가 세로로 과하게 늘어나지 않게 한 번에 보여주는 칩 개수 */
const VISIBLE_LIMIT = 3;

/**
 * 전달 대기 중인 입력 바 (작업 중 세션의 입력 큐잉)
 *
 * 미즈키가 지금 보고 있는 세션에서 턴을 돌고 있는 동안 보낸 입력은 바로 처리되지
 * 않고 백엔드 큐에 쌓인다. 입력한 문장 자체는 이미 채팅 기록에 사용자 말풍선으로
 * 올라가 있으므로(use-text-input 의 appendHumanMessage), 여기서는 말풍선을 또
 * 그리지 않고 입력창 바로 위에 "아직 전달 안 됨" 상태만 한 줄 바로 알린다.
 * X 를 누르면 그 항목만 취소한다. 큐가 비면 아무것도 렌더하지 않는다.
 */
function QueuedInputBar(): JSX.Element | null {
  const { items, cancel } = useQueuedInputs();

  if (items.length === 0) return null;

  const visible = items.slice(0, VISIBLE_LIMIT);
  const hidden = items.length - visible.length;

  return (
    <Flex
      align="center"
      gap={2}
      wrap="wrap"
      px={2}
      py="5px"
      bg="whiteAlpha.100"
      border="1px solid"
      borderColor="whiteAlpha.200"
      borderRadius="10px"
    >
      <Text fontSize="10px" color="whiteAlpha.600" flexShrink={0} whiteSpace="nowrap">
        {`대기 중 ${items.length}건`}
      </Text>
      {visible.map((item) => (
        <Flex
          key={item.id}
          align="center"
          gap={1}
          maxW="180px"
          minW={0}
          px={2}
          py="1px"
          bg="whiteAlpha.200"
          borderRadius="full"
        >
          <Text
            fontSize="11px"
            color="whiteAlpha.700"
            lineHeight="1.6"
            truncate
            title={item.text}
          >
            {item.text}
          </Text>
          <Box
            as="button"
            aria-label="대기 취소"
            title="대기 취소"
            flexShrink={0}
            display="flex"
            alignItems="center"
            color="whiteAlpha.600"
            _hover={{ color: 'red.300' }}
            onClick={() => cancel(item.id)}
          >
            <FiX size={11} />
          </Box>
        </Flex>
      ))}
      {hidden > 0 && (
        <Text fontSize="10px" color="whiteAlpha.500" flexShrink={0} whiteSpace="nowrap">
          {`그 외 ${hidden}건`}
        </Text>
      )}
    </Flex>
  );
}

export default QueuedInputBar;
