/* eslint-disable import/no-extraneous-dependencies */
import { HStack, Stack, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { settingStyles } from './setting-styles';
import { useAgentSettings } from '@/hooks/sidebar/setting/use-agent-settings';
import { Radio, RadioGroup } from '@/components/ui/radio';
import { ProactiveMode } from '@/context/proactive-speak-context';
import { useBroadcasting } from '@/context/broadcasting-context';
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
  } = useAgentSettings({ onSave, onCancel });
  const { isBroadcasting, setIsBroadcasting } = useBroadcasting();

  return (
    <Stack {...settingStyles.common.container}>
      <SwitchField
        label="방송 중 (LLM에 [방송 중] 태그 전송)"
        checked={isBroadcasting}
        onChange={setIsBroadcasting}
      />

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
