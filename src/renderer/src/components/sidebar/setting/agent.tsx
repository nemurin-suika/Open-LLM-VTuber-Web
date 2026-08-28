/* eslint-disable import/no-extraneous-dependencies */
import { HStack, Stack, Text, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { settingStyles } from './setting-styles';
import { useAgentSettings } from '@/hooks/sidebar/setting/use-agent-settings';
import { Radio, RadioGroup } from '@/components/ui/radio';
import { ProactiveMode } from '@/context/proactive-speak-context';
import { SwitchField, NumberField } from './common';

interface AgentProps {
  onSave?: (callback: () => void) => () => void
  onCancel?: (callback: () => void) => () => void
}

function Agent({ onSave, onCancel }: AgentProps): JSX.Element {
  const { t } = useTranslation();
  const {
    settings,
    handleAllowProactiveSpeakChange,
    handleIdleSecondsChange,
    handleAllowButtonTriggerChange,
    handleModeChange,
    handleProactiveInstructionChange,
  } = useAgentSettings({ onSave, onCancel });

  return (
    <Stack {...settingStyles.common.container}>
      <SwitchField
        label={t('settings.agent.allowProactiveSpeak')}
        checked={settings.allowProactiveSpeak}
        onChange={handleAllowProactiveSpeakChange}
      />

      {settings.allowProactiveSpeak && (
        <>
          <NumberField
            label={t('settings.agent.idleSecondsToSpeak')}
            value={settings.idleSecondsToSpeak}
            onChange={(value) => handleIdleSecondsChange(Number(value))}
            min={0}
            step={0.1}
            allowMouseWheel
          />

          <Stack gap={2}>
            <Text fontSize="sm" fontWeight="medium">Proactive 모드</Text>
            <RadioGroup
              value={settings.mode}
              onValueChange={(details) => handleModeChange(details.value as ProactiveMode)}
            >
              <HStack gap={4}>
                <Radio value="broadcast">방송용 (시청자/혼잣말)</Radio>
                <Radio value="private">개인용 (네무린과 1:1, 화면+오디오 본다)</Radio>
              </HStack>
            </RadioGroup>
          </Stack>

          <Stack gap={2}>
            <Text fontSize="sm" fontWeight="medium">Proactive 지시문</Text>
            <Text fontSize="xs" color="gray.400">
              proactive 트리거마다 기본 프롬프트 뒤에 덧붙여 전달됨.
              비워두면 기존 동작 그대로. 예: 지금은 방해 금지, 조용히 지켜만 보고
              꼭 필요할 때만 무음 태그로 말해.
            </Text>
            <Textarea
              value={settings.proactiveInstruction}
              onChange={(e) => handleProactiveInstructionChange(e.target.value)}
              placeholder="예: 지금은 경기 관전 중이야. 웬만하면 조용히 있고 큰 사건 있을 때만 짧게 말해."
              rows={4}
              fontSize="sm"
            />
          </Stack>
        </>
      )}

      <SwitchField
        label={t('settings.agent.allowButtonTrigger')}
        checked={settings.allowButtonTrigger}
        onChange={handleAllowButtonTriggerChange}
      />
    </Stack>
  );
}

export default Agent;
