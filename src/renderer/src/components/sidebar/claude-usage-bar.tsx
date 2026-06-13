import { Box, Text } from '@chakra-ui/react';
import { useClaudeUsage } from '@/context/claude-usage-context';

interface BarProps {
  label: string;
  value: number;
  resetLabel?: string;
}

function UsageBar({ label, value, resetLabel }: BarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const color = clamped >= 80 ? '#e05555' : clamped >= 50 ? '#e0a555' : '#55b0e0';

  return (
    <Box mb="4px">
      <Box display="flex" justifyContent="space-between" mb="2px">
        <Text fontSize="10px" color="gray.400" lineHeight="1.2">
          {label}{resetLabel ? ` (${resetLabel})` : ''}
        </Text>
        <Text fontSize="10px" color="gray.300" lineHeight="1.2">
          {clamped.toFixed(1)}%
        </Text>
      </Box>
      <Box
        width="100%"
        height="4px"
        bg="whiteAlpha.200"
        borderRadius="2px"
        overflow="hidden"
      >
        <Box
          width={`${clamped}%`}
          height="100%"
          bg={color}
          borderRadius="2px"
          transition="width 0.4s ease"
        />
      </Box>
    </Box>
  );
}

export function ClaudeUsageBar() {
  const { usage } = useClaudeUsage();

  if (!usage) return null;

  return (
    <Box
      px="12px"
      py="8px"
      borderBottom="1px solid"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.300"
    >
      <Text fontSize="9px" color="gray.500" mb="6px" letterSpacing="0.05em">
        CLAUDE CODE USAGE
      </Text>
      <UsageBar label="5h" value={usage.five_h} resetLabel={usage.five_h_reset_kst || undefined} />
      <UsageBar label="7d" value={usage.seven_d} />
      <UsageBar label="7d(Sonnet)" value={usage.seven_d_s} />
    </Box>
  );
}

export default ClaudeUsageBar;
