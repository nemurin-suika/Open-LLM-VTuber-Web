/* eslint-disable operator-assignment */
/* eslint-disable object-shorthand */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCamera } from '@/context/camera-context';
import { useScreenCaptureContext } from '@/context/screen-capture-context';
import { useSystemAudioContext } from '@/context/system-audio-context';
import { toaster } from "@/components/ui/toaster";
import {
  IMAGE_COMPRESSION_QUALITY_KEY,
  DEFAULT_IMAGE_COMPRESSION_QUALITY,
  IMAGE_MAX_WIDTH_KEY,
  DEFAULT_IMAGE_MAX_WIDTH,
  PAST_SCREENSHOT_COUNT_KEY,
  DEFAULT_PAST_SCREENSHOT_COUNT,
  PAST_SCREENSHOT_INTERVAL_KEY,
  DEFAULT_PAST_SCREENSHOT_INTERVAL,
} from '@/hooks/sidebar/setting/use-general-settings';

// Add type definition for ImageCapture
declare class ImageCapture {
  constructor(track: MediaStreamTrack);

  grabFrame(): Promise<ImageBitmap>;
}

interface ImageData {
  source: 'camera' | 'screen';
  data: string;
  mime_type: string;
  ago_seconds?: number; // 캡처 시점 — 0=현재, 양수=N초 전, undefined=의미 없음(카메라)
}

export function useMediaCapture() {
  const { t } = useTranslation();
  const { stream: cameraStream } = useCamera();
  const { stream: screenStream, getPastScreenshots } = useScreenCaptureContext();
  const { getLatestAudio } = useSystemAudioContext();

  const getCompressionQuality = useCallback(() => {
    const storedQuality = localStorage.getItem(IMAGE_COMPRESSION_QUALITY_KEY);
    if (storedQuality) {
      const quality = parseFloat(storedQuality);
      if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) {
        return quality;
      }
    }
    return DEFAULT_IMAGE_COMPRESSION_QUALITY;
  }, []);

  const getImageMaxWidth = useCallback(() => {
    const storedMaxWidth = localStorage.getItem(IMAGE_MAX_WIDTH_KEY);
    if (storedMaxWidth) {
      const maxWidth = parseInt(storedMaxWidth, 10);
      if (!Number.isNaN(maxWidth) && maxWidth >= 0) {
        return maxWidth;
      }
    }
    return DEFAULT_IMAGE_MAX_WIDTH;
  }, []);

  const captureFrame = useCallback(async (stream: MediaStream | null, source: 'camera' | 'screen') => {
    if (!stream) {
      console.warn(`No ${source} stream available`);
      return null;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn(`No video track in ${source} stream`);
      return null;
    }

    const imageCapture = new ImageCapture(videoTrack);
    try {
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement('canvas');
      let { width, height } = bitmap;

      const maxWidth = getImageMaxWidth();
      if (maxWidth > 0 && width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Failed to get canvas context');
        return null;
      }

      ctx.drawImage(bitmap, 0, 0, width, height);
      const quality = getCompressionQuality();
      return canvas.toDataURL('image/jpeg', quality);
    } catch (error) {
      console.error(`Error capturing ${source} frame:`, error);
      toaster.create({
        title: `${t('error.failedCapture', { source: source })}: ${error}`,
        type: 'error',
        duration: 2000,
      });
      return null;
    }
  }, [t, getCompressionQuality, getImageMaxWidth]);

  const captureAllMedia = useCallback(async () => {
    const images: ImageData[] = [];

    // Capture camera frame
    if (cameraStream) {
      const cameraFrame = await captureFrame(cameraStream, 'camera');
      if (cameraFrame) {
        images.push({
          source: 'camera',
          data: cameraFrame,
          mime_type: 'image/jpeg',
        });
      }
    }

    // 과거 스크린샷들 (오래된 것부터 → 시간순으로 LLM에 전달)
    // count=N, interval=K → N*K, (N-1)*K, ..., 1*K 초 전.
    if (screenStream) {
      const countRaw = localStorage.getItem(PAST_SCREENSHOT_COUNT_KEY);
      const intervalRaw = localStorage.getItem(PAST_SCREENSHOT_INTERVAL_KEY);
      const count = countRaw ? Math.max(0, parseInt(countRaw, 10)) : DEFAULT_PAST_SCREENSHOT_COUNT;
      const interval = intervalRaw ? Math.max(0.5, parseFloat(intervalRaw)) : DEFAULT_PAST_SCREENSHOT_INTERVAL;
      if (count > 0 && interval > 0) {
        const secondsAgoList: number[] = [];
        for (let i = count; i >= 1; i -= 1) {
          secondsAgoList.push(i * interval); // 오래된 것이 먼저
        }
        // 허용 오차는 요청 간격에 비례 (간격을 넓게 잡아도 항목이 통째로 걸러지지 않도록)
        const toleranceMs = Math.max(30_000, interval * 1000 * 0.75);
        const past = getPastScreenshots(secondsAgoList, toleranceMs);
        // past는 오래된 → 최근 순. 매칭 실패분이 빠질 수 있으므로
        // ago는 요청값이 아니라 실제 캡처 시각으로 계산한다.
        const nowMs = Date.now();
        past.forEach((p) => {
          images.push({
            source: 'screen',
            data: p.data,
            mime_type: p.mime_type,
            ago_seconds: Math.max(1, Math.round((nowMs - p.capturedAt) / 1000)),
          });
        });
      }
    }

    // 현재 화면 (가장 마지막에 push → LLM이 "최신"으로 인식)
    if (screenStream) {
      const screenFrame = await captureFrame(screenStream, 'screen');
      if (screenFrame) {
        images.push({
          source: 'screen',
          data: screenFrame,
          mime_type: 'image/jpeg',
          ago_seconds: 0,
        });
      }
    }

    console.log(`[useMediaCapture] images: ${images.length}장 (현재 screen 1장 + 과거 N장 + 카메라 0~1장)`);

    return images;
  }, [cameraStream, screenStream, captureFrame, getPastScreenshots]);

  // 시스템 오디오 롤링 버퍼에서 최근 N초 가져오기
  const captureSystemAudio = useCallback(async () => {
    try {
      const result = await getLatestAudio();
      if (result) {
        console.log(`[useMediaCapture] system audio 캡처 (${result.data.length}B base64, ${result.mime_type})`);
      } else {
        console.log('[useMediaCapture] system audio 없음 (캡처 OFF 또는 버퍼 비어있음)');
      }
      return result;
    } catch (e) {
      console.warn('[useMediaCapture] system audio 가져오기 실패:', e);
      return null;
    }
  }, [getLatestAudio]);

  return {
    captureAllMedia,
    captureSystemAudio,
  };
}
