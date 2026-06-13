/* eslint-disable react/jsx-props-no-spreading */
import { useEffect, useState } from 'react';
import { Badge, Box, Button, Code, Stack, Text } from '@chakra-ui/react';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from './ui/dialog';
import { wsService } from '../services/websocket-service';

interface RuleOption {
  id: string;
  label: string;
}

interface ToolApprovalRequest {
  request_id: string;
  tool_name: string;
  tool_input: Record<string, any>;
  rule_options: RuleOption[];
  ttl_days: number;
}

/**
 * Claude가 도구를 쓰려 할 때 백엔드가 보내는 "tool-approval-request"를 받아
 * 승인/항상 승인/거부 선택지를 띄우는 모달. 네무린의 선택을
 * "tool-approval-response"로 백엔드에 돌려준다.
 *
 * - 큐: 한 턴에 여러 도구를 쓰면 요청이 연달아 오므로, 큐에 쌓아 1건씩 순차 처리.
 * - 항상 승인 범위: Bash는 'cd … &&' 선행부를 제거한 실제 명령 기준으로
 *   "프로그램 전체(git …)" / "이 명령만" 등 후보를 백엔드가 rule_options로 보내며,
 *   네무린이 그 중 하나를 골라 범위를 통제한다.
 *
 * wsService를 직접 구독하므로 별도 context 배선이 필요 없다.
 */
function ToolApprovalDialog(): JSX.Element {
  const [queue, setQueue] = useState<ToolApprovalRequest[]>([]);

  useEffect(() => {
    const sub = wsService.onMessage((message: any) => {
      if (message?.type === 'tool-approval-request') {
        const req: ToolApprovalRequest = {
          request_id: message.request_id,
          tool_name: message.tool_name,
          tool_input: message.tool_input || {},
          rule_options: Array.isArray(message.rule_options) ? message.rule_options : [],
          ttl_days: message.ttl_days ?? 3,
        };
        // functional update — 빠르게 연속 도착해도 누락 없이 누적. request_id 중복은 무시.
        setQueue((q) =>
          q.some((r) => r.request_id === req.request_id) ? q : [...q, req],
        );
      }
    });
    return () => sub.unsubscribe();
  }, []);

  const current = queue[0];

  const respond = (
    decision: 'allow' | 'deny',
    scope: 'once' | 'always' = 'once',
    ruleOption?: string,
  ) => {
    if (!current) return;
    wsService.sendMessage({
      type: 'tool-approval-response',
      request_id: current.request_id,
      decision,
      scope,
      rule_option: ruleOption,
    });
    // 처리한 맨 앞 1건 제거 → 다음 요청이 자동으로 표시됨.
    setQueue((q) => q.slice(1));
  };

  if (!current) return <></>;

  // tool_input 미리보기 — Bash는 command만, 그 외엔 JSON 전체.
  const preview =
    current.tool_name === 'Bash'
      ? String(current.tool_input.command ?? '')
      : JSON.stringify(current.tool_input, null, 2);

  const pending = queue.length - 1;

  return (
    <DialogRoot
      open={!!current}
      onOpenChange={(e) => {
        // 바깥 클릭/ESC로 닫으면 현재 1건만 거부 (다음 요청은 그대로 표시됨).
        if (!e.open) respond('deny');
      }}
      placement="center"
      role="alertdialog"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            🛠️ 도구 사용 승인 요청
            {pending > 0 && (
              <Badge ml="2" colorPalette="orange">
                대기 {pending}건
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Stack gap="2">
            <Text>
              미즈키가 <b>{current.tool_name}</b> 도구를 사용하려고 합니다.
            </Text>
            <Box
              maxH="220px"
              overflowY="auto"
              bg="blackAlpha.300"
              borderRadius="md"
              p="2"
            >
              <Code
                display="block"
                whiteSpace="pre-wrap"
                wordBreak="break-all"
                variant="plain"
              >
                {preview}
              </Code>
            </Box>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Stack gap="3" width="100%">
            <Stack direction="row" justify="flex-end" gap="2">
              <Button variant="outline" colorPalette="red" onClick={() => respond('deny')}>
                거부
              </Button>
              <Button colorPalette="green" onClick={() => respond('allow', 'once')}>
                승인 (이번만)
              </Button>
            </Stack>
            {current.rule_options.length > 0 && (
              <Stack gap="1">
                <Text fontSize="xs" color="gray.400">
                  항상 승인 — 고른 범위를 {current.ttl_days}일간 자동 허용:
                </Text>
                <Stack direction="row" wrap="wrap" gap="2">
                  {current.rule_options.map((opt) => (
                    <Button
                      key={opt.id}
                      size="sm"
                      variant="outline"
                      colorPalette="green"
                      onClick={() => respond('allow', 'always', opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

export default ToolApprovalDialog;
