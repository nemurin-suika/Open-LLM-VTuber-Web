/* eslint-disable react/jsx-props-no-spreading */
import { useEffect, useRef, useState } from 'react';
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

// 승인 요청 도착 알림음 — 에셋 없이 Web Audio API로 2음 "삡삡" 생성.
let beepCtx: AudioContext | null = null;
function playApprovalBeep(): void {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!beepCtx) beepCtx = new Ctor();
    const ctx = beepCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const tone = (start: number, freq: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };
    tone(now, 880, 0.15); // 삡
    tone(now + 0.18, 1175, 0.18); // 삡 (높게)
  } catch {
    // 오디오 불가 환경은 조용히 무시
  }
}

interface ToolApprovalRequest {
  request_id: string;
  tool_name: string;
  tool_input: Record<string, any>;
  rule_options: RuleOption[];
  ttl_days: number;
  intent?: string;
}

/** 도구별 미리보기 렌더러 — Edit/Write는 GitHub diff 스타일, 나머지는 기존 유지. */
function DiffPreview({
  toolName,
  toolInput,
}: {
  toolName: string;
  toolInput: Record<string, any>;
}): JSX.Element {
  if (toolName === 'Bash') {
    return (
      <Code display="block" whiteSpace="pre-wrap" wordBreak="break-all" variant="plain">
        {String(toolInput.command ?? '')}
      </Code>
    );
  }

  if (toolName === 'Edit') {
    const filePath = String(toolInput.file_path ?? '');
    const oldLines = String(toolInput.old_string ?? '').split('\n');
    const newLines = String(toolInput.new_string ?? '').split('\n');
    return (
      <Box fontFamily="mono" fontSize="xs">
        <Text color="gray.400" mb="1" fontSize="11px">
          📄 {filePath}
        </Text>
        {oldLines.map((line, i) => (
          <Box
            key={`del-${i}`}
            style={{
              background: 'rgba(255,80,80,0.13)',
              borderLeft: '3px solid #e05252',
              paddingLeft: '6px',
            }}
          >
            <Code variant="plain" color="red.300" fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all">
              {`- ${line}`}
            </Code>
          </Box>
        ))}
        <Box style={{ borderTop: '1px solid #444', margin: '3px 0' }} />
        {newLines.map((line, i) => (
          <Box
            key={`add-${i}`}
            style={{
              background: 'rgba(80,200,80,0.13)',
              borderLeft: '3px solid #52c052',
              paddingLeft: '6px',
            }}
          >
            <Code variant="plain" color="green.300" fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all">
              {`+ ${line}`}
            </Code>
          </Box>
        ))}
      </Box>
    );
  }

  if (toolName === 'Write') {
    const filePath = String(toolInput.file_path ?? '');
    const contentLines = String(toolInput.content ?? '').split('\n');
    return (
      <Box fontFamily="mono" fontSize="xs">
        <Text color="gray.400" mb="1" fontSize="11px">
          📄 {filePath} (새로 쓰기)
        </Text>
        {contentLines.map((line, i) => (
          <Box
            key={`add-${i}`}
            style={{
              background: 'rgba(80,200,80,0.13)',
              borderLeft: '3px solid #52c052',
              paddingLeft: '6px',
            }}
          >
            <Code variant="plain" color="green.300" fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all">
              {`+ ${line}`}
            </Code>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Code display="block" whiteSpace="pre-wrap" wordBreak="break-all" variant="plain">
      {JSON.stringify(toolInput, null, 2)}
    </Code>
  );
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
  // 이미 처리한 request_id — 중복 수신 시 비프음/재추가 방지.
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sub = wsService.onMessage((message: any) => {
      if (message?.type === 'tool-approval-request') {
        const reqId = message.request_id;
        if (!reqId || seenIds.current.has(reqId)) return;
        seenIds.current.add(reqId);

        const req: ToolApprovalRequest = {
          request_id: reqId,
          tool_name: message.tool_name,
          tool_input: message.tool_input || {},
          rule_options: Array.isArray(message.rule_options) ? message.rule_options : [],
          ttl_days: message.ttl_days ?? 3,
          intent: message.intent || '',
        };
        // 새 승인 요청 도착 → 경고음 (다이얼로그만으론 놓치기 쉬움).
        playApprovalBeep();
        setQueue((q) => [...q, req]);
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
            {current.intent && (
              <Box
                bg="purple.950"
                borderRadius="md"
                p="2"
                borderLeft="3px solid"
                borderColor="purple.400"
              >
                <Text fontSize="xs" color="purple.300" mb="1">
                  💭 미즈키의 의도
                </Text>
                <Text fontSize="sm" color="gray.100" whiteSpace="pre-wrap">
                  {current.intent}
                </Text>
              </Box>
            )}
            <Box
              maxH="220px"
              overflowY="auto"
              bg="blackAlpha.300"
              borderRadius="md"
              p="2"
            >
              <DiffPreview toolName={current.tool_name} toolInput={current.tool_input} />
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
