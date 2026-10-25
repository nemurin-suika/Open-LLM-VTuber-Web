import { Box, Flex, Image, Text } from '@chakra-ui/react';
import { FiX } from 'react-icons/fi';
import { useAttachments } from '@/context/attachment-context';

/**
 * 전송 대기 중인 첨부 이미지 바
 *
 * 입력창 바로 위에 썸네일을 늘어놓고 X 로 하나씩 뺄 수 있게 한다.
 * 첨부가 없으면 아무것도 렌더하지 않아 평소 화면은 그대로다.
 */
function AttachmentBar(): JSX.Element | null {
  const { attachments, removeAttachment, isProcessing } = useAttachments();

  if (attachments.length === 0 && !isProcessing) return null;

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
        {isProcessing ? '불러오는 중' : `첨부 ${attachments.length}장`}
      </Text>
      {attachments.map((att) => (
        <Box key={att.id} position="relative" flexShrink={0} title={att.name}>
          <Image
            src={att.data}
            alt={att.name}
            height="40px"
            width="40px"
            objectFit="cover"
            borderRadius="6px"
            border="1px solid"
            borderColor="whiteAlpha.300"
          />
          <Box
            as="button"
            aria-label="첨부 제거"
            title="첨부 제거"
            position="absolute"
            top="-4px"
            right="-4px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            width="16px"
            height="16px"
            borderRadius="full"
            bg="gray.900"
            color="whiteAlpha.800"
            _hover={{ color: 'red.300' }}
            onClick={() => removeAttachment(att.id)}
          >
            <FiX size={11} />
          </Box>
        </Box>
      ))}
    </Flex>
  );
}

export default AttachmentBar;
