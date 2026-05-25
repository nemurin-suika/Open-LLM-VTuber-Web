import { useCallback } from "react";
import { useWebSocket } from "@/context/websocket-context";
import { useMediaCapture } from "@/hooks/utils/use-media-capture";
import { useBroadcasting } from "@/context/broadcasting-context";
import { audioManager } from "@/utils/audio-manager";

export function useSendAudio() {
  const { sendMessage } = useWebSocket();
  const { captureAllMedia, captureSystemAudio } = useMediaCapture();
  const { isBroadcasting } = useBroadcasting();

  const sendAudioPartition = useCallback(
    async (audio: Float32Array) => {
      const chunkSize = 4096;

      // Send the audio data in chunks
      for (let index = 0; index < audio.length; index += chunkSize) {
        const endIndex = Math.min(index + chunkSize, audio.length);
        const chunk = audio.slice(index, endIndex);
        sendMessage({
          type: "mic-audio-data",
          audio: Array.from(chunk),
        });
      }

      // Send end signal after all chunks — include current volume (0-100 scale)
      const [images, system_audio] = await Promise.all([
        captureAllMedia(),
        captureSystemAudio(),
      ]);
      const currentVolumePercent = Math.round(audioManager.getVolume() * 100);
      sendMessage({
        type: "mic-audio-end",
        images,
        system_audio,
        is_broadcasting: isBroadcasting,
        current_volume: currentVolumePercent,
      });
    },
    [sendMessage, captureAllMedia, captureSystemAudio, isBroadcasting],
  );

  return {
    sendAudioPartition,
  };
}
