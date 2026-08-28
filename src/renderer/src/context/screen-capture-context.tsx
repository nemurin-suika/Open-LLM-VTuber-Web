import {
  createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from "@/components/ui/toaster";

// 매초 캡처해서 보관하는 스크린샷 1장. data는 dataURL ("data:image/jpeg;base64,...").
export interface BufferedScreenshot {
  data: string;
  mime_type: string;
  capturedAt: number; // Date.now()
}

interface ScreenCaptureContextType {
  stream: MediaStream | null;
  isStreaming: boolean;
  error: string;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  // 과거 N장을 요청 시점 기준 secondsAgoList에서 가장 가까운 버퍼 항목으로 반환.
  // toleranceMs를 넘게 벗어난 항목은 제외. 생략 시 30초.
  // 캡처가 OFF이거나 버퍼에 데이터가 없으면 빈 배열.
  getPastScreenshots: (
    secondsAgoList: number[],
    toleranceMs?: number,
  ) => BufferedScreenshot[];
}

const ScreenCaptureContext = createContext<ScreenCaptureContextType | undefined>(undefined);

// 롤링 버퍼 길이 / 캡처 주기는 설정으로 조정 가능 (localStorage, 재시작 없이 반영).
// 기본 300초 보관 + 2초마다 1장 → 최대 150장 유지.
const SCREENSHOT_BUFFER_SECONDS_KEY = 'appScreenshotBufferSeconds';
const DEFAULT_SCREENSHOT_BUFFER_SECONDS = 300;
const SCREENSHOT_CAPTURE_INTERVAL_KEY = 'appScreenshotCaptureIntervalSec';
const DEFAULT_SCREENSHOT_CAPTURE_INTERVAL_SEC = 2;
// 캡처 압축 설정 — use-media-capture와 분리되어 있어 동일 키를 다시 읽음
const IMAGE_COMPRESSION_QUALITY_KEY = 'appImageCompressionQuality';
const IMAGE_MAX_WIDTH_KEY = 'appImageMaxWidth';

function readBufferSeconds(): number {
  const v = localStorage.getItem(SCREENSHOT_BUFFER_SECONDS_KEY);
  if (!v) return DEFAULT_SCREENSHOT_BUFFER_SECONDS;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 10 ? n : DEFAULT_SCREENSHOT_BUFFER_SECONDS;
}

function readCaptureIntervalMs(): number {
  const v = localStorage.getItem(SCREENSHOT_CAPTURE_INTERVAL_KEY);
  if (!v) return DEFAULT_SCREENSHOT_CAPTURE_INTERVAL_SEC * 1000;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0.5
    ? n * 1000
    : DEFAULT_SCREENSHOT_CAPTURE_INTERVAL_SEC * 1000;
}

// ImageCapture 타입 (use-media-capture.tsx와 동일)
declare class ImageCapture {
  constructor(track: MediaStreamTrack);

  grabFrame(): Promise<ImageBitmap>;
}

function readQuality(): number {
  const v = localStorage.getItem(IMAGE_COMPRESSION_QUALITY_KEY);
  if (!v) return 0.8;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0.1 && n <= 1.0 ? n : 0.8;
}

function readMaxWidth(): number {
  const v = localStorage.getItem(IMAGE_MAX_WIDTH_KEY);
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function ScreenCaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');

  const bufferRef = useRef<BufferedScreenshot[]>([]);
  const captureTimerRef = useRef<number | null>(null);
  const captureInFlightRef = useRef<boolean>(false);
  const streamForCaptureRef = useRef<MediaStream | null>(null);

  // 한 프레임 캡처 → BufferedScreenshot. 실패 시 null.
  const grabOne = useCallback(async (): Promise<BufferedScreenshot | null> => {
    const s = streamForCaptureRef.current;
    if (!s) return null;
    const track = s.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return null;
    try {
      const ic = new ImageCapture(track);
      const bitmap = await ic.grabFrame();
      const canvas = document.createElement('canvas');
      let { width, height } = bitmap;
      const maxW = readMaxWidth();
      if (maxW > 0 && width > maxW) {
        height = (maxW / width) * height;
        width = maxW;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const data = canvas.toDataURL('image/jpeg', readQuality());
      return { data, mime_type: 'image/jpeg', capturedAt: Date.now() };
    } catch (e) {
      console.warn('[ScreenCapture] grabOne 실패:', e);
      return null;
    }
  }, []);

  // 캡처 루프 시작/정지
  const startCaptureLoop = useCallback(() => {
    if (captureTimerRef.current !== null) return;
    // setInterval 대신 setTimeout 체인 — 매 회차마다 최신 간격 설정을 다시 읽는다.
    const tick = async () => {
      captureTimerRef.current = null;
      if (!captureInFlightRef.current) {
        captureInFlightRef.current = true;
        try {
          const shot = await grabOne();
          if (shot) {
            bufferRef.current.push(shot);
            const cutoff = Date.now() - readBufferSeconds() * 1000;
            while (bufferRef.current.length > 0 && bufferRef.current[0].capturedAt < cutoff) {
              bufferRef.current.shift();
            }
          }
        } finally {
          captureInFlightRef.current = false;
        }
      }
      // 스트림이 끊겼으면 루프 종료
      if (!streamForCaptureRef.current) return;
      captureTimerRef.current = window.setTimeout(tick, readCaptureIntervalMs());
    };
    // 즉시 1장 + 이후 설정 간격마다 반복
    void tick();
  }, [grabOne]);

  const stopCaptureLoop = useCallback(() => {
    if (captureTimerRef.current !== null) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    bufferRef.current = [];
    streamForCaptureRef.current = null;
  }, []);

  const getPastScreenshots = useCallback((
    secondsAgoList: number[],
    toleranceMs?: number,
  ): BufferedScreenshot[] => {
    if (bufferRef.current.length === 0 || !secondsAgoList || secondsAgoList.length === 0) {
      return [];
    }
    const tolerance = toleranceMs && toleranceMs > 0 ? toleranceMs : 30_000;
    const now = Date.now();
    const out: BufferedScreenshot[] = [];
    const seenTimestamps = new Set<number>();
    for (const secAgo of secondsAgoList) {
      const target = now - secAgo * 1000;
      // 가장 가까운(절대 차이 작은) 버퍼 항목 찾기
      let best: BufferedScreenshot | null = null;
      let bestDiff = Infinity;
      for (const s of bufferRef.current) {
        const diff = Math.abs(s.capturedAt - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = s;
        }
      }
      // 요청 시점에서 tolerance 이상 벗어나면 의미 없으므로 스킵
      if (best && bestDiff < tolerance && !seenTimestamps.has(best.capturedAt)) {
        out.push(best);
        seenTimestamps.add(best.capturedAt);
      }
    }
    return out;
  }, []);

  const startCapture = async () => {
    try {
      let mediaStream: MediaStream;

      if (window.electron) {
        const sourceId = await window.electron.ipcRenderer.invoke('get-screen-capture');

        const displayMediaOptions: DisplayMediaStreamOptions = {
          video: {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              minWidth: 1280,
              maxWidth: 1280,
              minHeight: 720,
              maxHeight: 720,
            },
          },
          audio: false,
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(displayMediaOptions);
      } else {
        const displayMediaOptions: DisplayMediaStreamOptions = {
          video: true,
          audio: false,
        };
        mediaStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      }

      setStream(mediaStream);
      setIsStreaming(true);
      setError('');
      // 매초 캡처 루프 시작
      streamForCaptureRef.current = mediaStream;
      startCaptureLoop();
    } catch (err) {
      setError(t('error.failedStartScreenCapture'));
      toaster.create({
        title: `${t('error.failedStartScreenCapture')}: ${err}`,
        type: 'error',
        duration: 2000,
      });
      console.error(err);
    }
  };

  const stopCapture = () => {
    stopCaptureLoop();
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsStreaming(false);
    }
  };

  useEffect(() => () => stopCaptureLoop(), [stopCaptureLoop]);

  return (
    <ScreenCaptureContext.Provider
      // eslint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        stream,
        isStreaming,
        error,
        startCapture,
        stopCapture,
        getPastScreenshots,
      }}
    >
      {children}
    </ScreenCaptureContext.Provider>
  );
}

export const useScreenCaptureContext = () => {
  const context = useContext(ScreenCaptureContext);
  if (context === undefined) {
    throw new Error('useScreenCaptureContext must be used within a ScreenCaptureProvider');
  }
  return context;
};
