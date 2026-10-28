import { Box, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useWebSocket } from '@/context/websocket-context';

interface CodexUsage {
  enabled: boolean;
  status: 'ready' | 'stale' | 'unavailable' | 'disabled';
  amount?: string | null;
  currency?: string;
  cost_status?: 'complete' | 'partial' | 'unavailable';
  has_usage?: boolean;
  period_start?: string;
  period_end?: string;
  updated_at?: string;
  warning_count?: number;
}

function amountLabel(usage: CodexUsage): string {
  if (usage.status === 'unavailable') return '비용 조회 불가';
  if (usage.amount == null || !Number.isFinite(Number(usage.amount))) return '계산 불가';
  const amount = Number(usage.amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${usage.currency ?? ''}${usage.cost_status === 'partial' ? ' 이상 · 일부 집계' : ''}`;
}

export function CodexUsageBar() {
  const { baseUrl, wsState } = useWebSocket();
  const [usage, setUsage] = useState<CodexUsage | null>(null);

  useEffect(() => setUsage(null), [baseUrl]);

  useEffect(() => {
    let disposed = false;
    let active = false;
    let controller: AbortController | undefined;

    const refresh = async () => {
      if (active || disposed) return;
      active = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 20000);
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/codex-usage`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Usage query failed');
        const data: CodexUsage = await response.json();
        if (typeof data.enabled !== 'boolean'
          || !['ready', 'stale', 'unavailable', 'disabled'].includes(data.status)) {
          throw new Error('Invalid usage response');
        }
        if (!disposed) setUsage(data);
      } catch {
        if (!disposed) {
          setUsage((previous) => (previous?.enabled
            ? { ...previous, status: previous.amount == null ? 'unavailable' : 'stale' }
            : previous));
        }
      } finally {
        window.clearTimeout(timeout);
        active = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [baseUrl, wsState]);

  if (!usage?.enabled) return null;

  const updated = usage.updated_at ? new Date(usage.updated_at) : null;
  const updatedLabel = updated && Number.isFinite(updated.getTime())
    ? updated.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })
    : '';

  return (
    <Box
      px="12px"
      py="8px"
      flexShrink={0}
      borderBottom="1px solid"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.300"
      role="status"
      aria-label="Codex 월간 추정 비용"
    >
      <Box display="flex" justifyContent="space-between" alignItems="baseline" gap="8px">
        <Text fontSize="10px" color="gray.400">CODEX 이번 달 추정 비용</Text>
        <Text fontSize="13px" color={usage.status === 'ready' ? 'cyan.200' : 'orange.200'} fontWeight="semibold">
          {amountLabel(usage)}
        </Text>
      </Box>
      {usage.period_start && usage.period_end && (
        <Text fontSize="10px" color="gray.400">
          {`${usage.period_start} ~ ${usage.period_end} · KST`}
        </Text>
      )}
      <Text fontSize="10px" color="gray.500">이 기기 로컬 기록 전체 · 실제 청구액 아님</Text>
      {usage.has_usage === false && (
        <Text fontSize="10px" color="gray.400">이번 달 저장된 사용 기록 없음</Text>
      )}
      {(usage.warning_count ?? 0) > 0 && (
        <Text fontSize="10px" color="orange.200">누락되거나 계산할 수 없는 기록이 있어요</Text>
      )}
      {usage.status === 'unavailable' && (
        <Text fontSize="10px" color="orange.200">서버의 비용 도구 설치와 설정을 확인해 주세요</Text>
      )}
      {updatedLabel && (
        <Text fontSize="10px" color={usage.status === 'stale' ? 'orange.200' : 'gray.500'}>
          {`${usage.status === 'stale' ? '갱신 실패 · 이전 값' : '갱신'} ${updatedLabel} KST`}
        </Text>
      )}
    </Box>
  );
}
