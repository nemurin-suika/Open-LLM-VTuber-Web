/* eslint-disable import/no-extraneous-dependencies */
import { useTranslation } from "react-i18next";
import { Stack, createListCollection } from "@chakra-ui/react";
import { useBgUrl } from "@/context/bgurl-context";
import { settingStyles } from "./setting-styles";
import { useConfig } from "@/context/character-config-context";
import { useGeneralSettings } from "@/hooks/sidebar/setting/use-general-settings";
import { useWebSocket } from "@/context/websocket-context";
import { SelectField, SwitchField, InputField } from "./common";

interface GeneralProps {
  onSave?: (callback: () => void) => () => void;
  onCancel?: (callback: () => void) => () => void;
}

// Data collection definition
const useCollections = () => {
  const { backgroundFiles } = useBgUrl() || {};
  const { configFiles } = useConfig();

  const languages = createListCollection({
    items: [
      { label: "English", value: "en" },
      { label: "中文", value: "zh" },
    ],
  });

  const backgrounds = createListCollection({
    items:
      backgroundFiles?.map((filename) => ({
        label: String(filename),
        value: `/bg/${filename}`,
      })) || [],
  });

  const characterPresets = createListCollection({
    items: configFiles.map((config) => ({
      label: config.name,
      value: config.filename,
    })),
  });

  return {
    languages,
    backgrounds,
    characterPresets,
  };
};

function General({ onSave, onCancel }: GeneralProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const bgUrlContext = useBgUrl();
  const { confName, setConfName } = useConfig();
  const { wsUrl, setWsUrl, baseUrl, setBaseUrl } = useWebSocket();
  const collections = useCollections();

  const {
    settings,
    handleSettingChange,
    handleCameraToggle,
    handleCharacterPresetChange,
    showSubtitle,
    setShowSubtitle,
  } = useGeneralSettings({
    bgUrlContext,
    confName,
    setConfName,
    baseUrl,
    wsUrl,
    onWsUrlChange: setWsUrl,
    onBaseUrlChange: setBaseUrl,
    onSave,
    onCancel,
  });

  if (settings.language[0] !== i18n.language) {
    handleSettingChange("language", [i18n.language]);
  }

  return (
    <Stack {...settingStyles.common.container}>
      <SelectField
        label={t("settings.general.language")}
        value={settings.language}
        onChange={(value) => handleSettingChange("language", value)}
        collection={collections.languages}
        placeholder={t("settings.general.language")}
      />

      <SwitchField
        label={t("settings.general.useCameraBackground")}
        checked={settings.useCameraBackground}
        onChange={handleCameraToggle}
      />

      <SwitchField
        label={t("settings.general.showSubtitle")}
        checked={showSubtitle}
        onChange={setShowSubtitle}
      />

      {!settings.useCameraBackground && (
        <>
          <SelectField
            label={t("settings.general.backgroundImage")}
            value={settings.selectedBgUrl}
            onChange={(value) => handleSettingChange("selectedBgUrl", value)}
            collection={collections.backgrounds}
            placeholder={t("settings.general.backgroundImage")}
          />

          <InputField
            label={t("settings.general.customBgUrl")}
            value={settings.customBgUrl}
            onChange={(value) => handleSettingChange("customBgUrl", value)}
            placeholder={t("settings.general.customBgUrlPlaceholder")}
          />
        </>
      )}

      <SelectField
        label={t("settings.general.characterPreset")}
        value={settings.selectedCharacterPreset}
        onChange={handleCharacterPresetChange}
        collection={collections.characterPresets}
        placeholder={confName || t("settings.general.characterPreset")}
      />

      <InputField
        label={t("settings.general.wsUrl")}
        value={settings.wsUrl}
        onChange={(value) => handleSettingChange("wsUrl", value)}
        placeholder="Enter WebSocket URL"
      />

      <InputField
        label={t("settings.general.baseUrl")}
        value={settings.baseUrl}
        onChange={(value) => handleSettingChange("baseUrl", value)}
        placeholder="Enter Base URL"
      />

      <InputField
        label={t("settings.general.imageCompressionQuality")}
        value={settings.imageCompressionQuality.toString()}
        onChange={(value) => {
          const quality = parseFloat(value as string);
          if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) {
            handleSettingChange("imageCompressionQuality", quality);
          } else if (value === "") {
            handleSettingChange("imageCompressionQuality", settings.imageCompressionQuality);
          }
        }}
        help={t("settings.general.imageCompressionQualityHelp")}
      />

      <InputField
        label={t("settings.general.imageMaxWidth")}
        value={settings.imageMaxWidth.toString()}
        onChange={(value) => {
          const maxWidth = parseInt(value as string, 10);
          if (!Number.isNaN(maxWidth) && maxWidth >= 0) {
            handleSettingChange("imageMaxWidth", maxWidth);
          } else if (value === "") {
            handleSettingChange("imageMaxWidth", settings.imageMaxWidth);
          }
        }}
        help={t("settings.general.imageMaxWidthHelp")}
      />

      <InputField
        label="과거 스크린샷 장수"
        value={settings.pastScreenshotCount.toString()}
        onChange={(value) => {
          const n = parseInt(value as string, 10);
          if (!Number.isNaN(n) && n >= 0 && n <= 200) {
            handleSettingChange("pastScreenshotCount", n);
          } else if (value === "") {
            handleSettingChange("pastScreenshotCount", settings.pastScreenshotCount);
          }
        }}
        help="현재 스크린샷 외에 과거 N장을 함께 LLM에 전송 (0~200). 장수가 많을수록 응답이 느려짐"
      />

      <InputField
        label="과거 스크린샷 간격(초)"
        value={settings.pastScreenshotIntervalSec.toString()}
        onChange={(value) => {
          const n = parseFloat(value as string);
          if (!Number.isNaN(n) && n >= 1 && n <= 600) {
            handleSettingChange("pastScreenshotIntervalSec", n);
          } else if (value === "") {
            handleSettingChange("pastScreenshotIntervalSec", settings.pastScreenshotIntervalSec);
          }
        }}
        help="과거 N장이 K초 간격(예: count=10, interval=20 → 최근 200초를 20초 간격으로)"
      />

      <InputField
        label="스크린샷 버퍼 길이(초)"
        value={settings.screenshotBufferSeconds.toString()}
        onChange={(value) => {
          const n = parseFloat(value as string);
          if (!Number.isNaN(n) && n >= 10 && n <= 3600) {
            handleSettingChange("screenshotBufferSeconds", n);
          } else if (value === "") {
            handleSettingChange("screenshotBufferSeconds", settings.screenshotBufferSeconds);
          }
        }}
        help="화면을 몇 초치까지 보관할지 (10~3600). 장수x간격보다 커야 함"
      />

      <InputField
        label="스크린샷 캡처 주기(초)"
        value={settings.screenshotCaptureIntervalSec.toString()}
        onChange={(value) => {
          const n = parseFloat(value as string);
          if (!Number.isNaN(n) && n >= 0.5 && n <= 60) {
            handleSettingChange("screenshotCaptureIntervalSec", n);
          } else if (value === "") {
            handleSettingChange(
              "screenshotCaptureIntervalSec",
              settings.screenshotCaptureIntervalSec,
            );
          }
        }}
        help="버퍼에 몇 초마다 1장 담을지 (0.5~60). 짧을수록 메모리 사용량 증가"
      />

      <InputField
        label="시스템 오디오 버퍼 길이(초)"
        value={settings.systemAudioBufferSeconds.toString()}
        onChange={(value) => {
          const n = parseFloat(value as string);
          if (!Number.isNaN(n) && n >= 10 && n <= 600) {
            handleSettingChange("systemAudioBufferSeconds", n);
          } else if (value === "") {
            handleSettingChange("systemAudioBufferSeconds", settings.systemAudioBufferSeconds);
          }
        }}
        help="소리를 몇 초치까지 보관할지 (10~600). 전송 길이보다 커야 함"
      />

      <InputField
        label="시스템 오디오 전송 길이(초)"
        value={settings.systemAudioSendSeconds.toString()}
        onChange={(value) => {
          const n = parseFloat(value as string);
          if (!Number.isNaN(n) && n >= 1 && n <= 600) {
            handleSettingChange("systemAudioSendSeconds", n);
          } else if (value === "") {
            handleSettingChange("systemAudioSendSeconds", settings.systemAudioSendSeconds);
          }
        }}
        help="롤링 버퍼에서 끝 N초를 LLM에 전송 (1~600초). 길수록 분석 시간이 비례해 늘어남"
      />
    </Stack>
  );
}

export default General;
