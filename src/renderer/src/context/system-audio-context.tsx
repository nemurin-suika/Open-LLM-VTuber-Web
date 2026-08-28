/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '@/components/ui/toaster';

interface SystemAudioData {
  data: string;       // base64 (data URL prefix 없이)
  mime_type: string;
}

interface SystemAudioContextType {
  isCapturing: boolean;
  hasAudioTrack: boolean;
  error: string;
  isMac: boolean;                                  // macOS면 deviceId 선택 UI 필요
  inputDevices: MediaDeviceInfo[];                 // macOS에서 사용 가능한 audio input 목록
  selectedDeviceId: string;                        // 사용자가 선택한 deviceId (macOS만)
  setSelectedDeviceId: (id: string) => void;
  refreshDevices: () => Promise<void>;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  getLatestAudio: () => Promise<SystemAudioData | null>;
}

const SystemAudioContext = createContext<SystemAudioContextType | undefined>(undefined);

// 롤링 버퍼 설정: 버퍼 길이와 전송 길이 모두 localStorage로 조정 가능 (재시작 없이 반영).
// 기본 300초 보관 → LLM에는 설정값(기본 10초)만 잘라 전송.
const SYSTEM_AUDIO_BUFFER_SECONDS_KEY = 'appSystemAudioBufferSeconds';
const DEFAULT_BUFFER_SECONDS = 300;
const MAX_BUFFER_SECONDS = 600;
const DEFAULT_SEND_SECONDS = 10;
const MAX_SEND_SECONDS = 600;
const SYSTEM_AUDIO_SEND_SECONDS_KEY = 'appSystemAudioSendSeconds';
const TIMESLICE_MS = 1000;

function readBufferSeconds(): number {
  const v = localStorage.getItem(SYSTEM_AUDIO_BUFFER_SECONDS_KEY);
  if (!v) return DEFAULT_BUFFER_SECONDS;
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n < 10) return DEFAULT_BUFFER_SECONDS;
  return Math.min(n, MAX_BUFFER_SECONDS);
}

function readSendSeconds(): number {
  const v = localStorage.getItem(SYSTEM_AUDIO_SEND_SECONDS_KEY);
  const bufferSec = readBufferSeconds();
  if (!v) return Math.min(DEFAULT_SEND_SECONDS, bufferSec);
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n < 1) return Math.min(DEFAULT_SEND_SECONDS, bufferSec);
  // 버퍼에 없는 구간은 보낼 수 없으므로 버퍼 길이로도 한 번 더 자름
  return Math.min(n, MAX_SEND_SECONDS, bufferSec);
}

// MediaRecorder가 실제로 지원하는 mime type 선택
function pickAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'audio/webm';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // "data:<mime>;base64,XXX" 에서 XXX만 추출
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// macOS 감지: Electron preload가 노출하는 process.platform 사용
function detectIsMac(): boolean {
  try {
    if (window.electron?.process?.platform === 'darwin') return true;
  } catch (e) { /* ignore */ }
  return /Mac|iPhone|iPad/i.test(navigator.userAgent);
}

const MAC_DEVICE_ID_STORAGE_KEY = 'systemAudioDeviceId';

export function SystemAudioProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [error, setError] = useState('');
  const [isMac] = useState<boolean>(() => detectIsMac());
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, _setSelectedDeviceId] = useState<string>(
    () => localStorage.getItem(MAC_DEVICE_ID_STORAGE_KEY) || '',
  );
  const setSelectedDeviceId = (id: string) => {
    _setSelectedDeviceId(id);
    if (id) localStorage.setItem(MAC_DEVICE_ID_STORAGE_KEY, id);
  };

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // 첫 chunk만 EBML 헤더를 포함하므로 따로 보관 → getLatestAudio에서 항상 prepend
  const headerChunkRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>('audio/webm');

  const refreshDevices = async () => {
    try {
      // enumerateDevices가 label을 채워주려면 한 번 권한 받아야 함
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach((tr) => tr.stop());
      } catch (e) { /* 권한 거부해도 일부 정보는 받음 */ }
      const all = await navigator.mediaDevices.enumerateDevices();
      const audios = all.filter((d) => d.kind === 'audioinput');
      setInputDevices(audios);
      console.log(`[SystemAudio] audio input ${audios.length}개:`, audios.map((d) => d.label));
    } catch (e) {
      console.warn('[SystemAudio] enumerateDevices 실패:', e);
    }
  };

  const startCapture = async () => {
    if (isCapturing) return;
    try {
      let mediaStream: MediaStream;

      if (isMac) {
        // macOS: chromeMediaSource desktop은 오디오 트랙을 빈 채로 반환하므로,
        // BlackHole 등 가상 오디오 장치를 deviceId로 직접 지정해서 캡처한다.
        if (!selectedDeviceId) {
          const msg = 'macOS에서는 오디오 입력 장치를 선택해야 합니다. BlackHole 같은 가상 오디오 장치를 입력에서 골라주세요.';
          setError(msg);
          toaster.create({ title: msg, type: 'warning', duration: 5000 });
          return;
        }
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: selectedDeviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
      } else if (window.electron) {
        // Windows/Linux + Electron: chromeMediaSource desktop으로 시스템 오디오 직접 캡처
        const sourceId = await window.electron.ipcRenderer.invoke('get-screen-capture');
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // @ts-expect-error - Electron desktopCapturer mandatory 옵션
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
            },
          },
          video: {
            // @ts-expect-error - Electron desktopCapturer mandatory 옵션
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1,
              maxHeight: 1,
              maxFrameRate: 1,
            },
          },
        });
        mediaStream.getVideoTracks().forEach((track) => track.stop());
      } else {
        // 일반 브라우저 (웹 모드)
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        mediaStream.getVideoTracks().forEach((track) => track.stop());
      }

      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) {
        mediaStream.getTracks().forEach((t2) => t2.stop());
        setHasAudioTrack(false);
        const msg = isMac
          ? `오디오 트랙이 비어있습니다. 선택한 입력 장치(${selectedDeviceId})를 확인하세요.`
          : '시스템 오디오 트랙이 없습니다.';
        setError(msg);
        toaster.create({ title: msg, type: 'warning', duration: 4000 });
        return;
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      streamRef.current = audioOnlyStream;

      const mimeType = pickAudioMimeType();
      mimeRef.current = mimeType;
      const recorder = new MediaRecorder(audioOnlyStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      headerChunkRef.current = null;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          // 첫 chunk만 EBML 헤더를 가지므로 따로 저장
          if (headerChunkRef.current === null) {
            headerChunkRef.current = e.data;
          }
          chunksRef.current.push(e.data);
          // 버퍼 길이 설정은 매 chunk마다 다시 읽는다 (사이드바에서 바꾸면 즉시 반영)
          const maxChunks = Math.ceil((readBufferSeconds() * 1000) / TIMESLICE_MS);
          if (chunksRef.current.length > maxChunks) {
            chunksRef.current = chunksRef.current.slice(-maxChunks);
          }
        }
      };
      recorder.onerror = (e) => {
        console.error('[SystemAudio] MediaRecorder error:', e);
      };

      recorder.start(TIMESLICE_MS);
      setIsCapturing(true);
      setHasAudioTrack(true);
      setError('');
      console.log(`[SystemAudio] 캡처 시작 (mime=${mimeType}, buffer=${readBufferSeconds()}s)`);
    } catch (err) {
      const msg = `시스템 오디오 캡처 실패: ${err}`;
      setError(msg);
      toaster.create({
        title: t('error.failedStartScreenCapture') || msg,
        type: 'error',
        duration: 2000,
      });
      console.error('[SystemAudio]', err);
    }
  };

  const stopCapture = () => {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch (e) {
      console.warn('[SystemAudio] recorder stop error:', e);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    headerChunkRef.current = null;
    setIsCapturing(false);
    setHasAudioTrack(false);
  };

  const getLatestAudio = async (): Promise<SystemAudioData | null> => {
    if (!isCapturing || chunksRef.current.length === 0) return null;
    try {
      // 매 호출마다 설정값을 읽음 (사용자가 사이드바에서 바꿔도 즉시 반영)
      const sendSec = readSendSeconds();
      const sendChunkCount = Math.ceil((sendSec * 1000) / TIMESLICE_MS);
      const slice = chunksRef.current.slice(-sendChunkCount);
      const parts: BlobPart[] = [];
      if (headerChunkRef.current && !slice.includes(headerChunkRef.current)) {
        parts.push(headerChunkRef.current);
      }
      parts.push(...slice);
      const blob = new Blob(parts, { type: mimeRef.current });
      if (blob.size < 2000) return null; // 너무 작으면 의미 있는 오디오 없음
      const base64 = await blobToBase64(blob);
      return { data: base64, mime_type: mimeRef.current };
    } catch (e) {
      console.warn('[SystemAudio] base64 변환 실패:', e);
      return null;
    }
  };

  useEffect(() => () => stopCapture(), []);

  // mac에서는 마운트 시 한 번 장치 목록을 자동 로드해서 UI가 비어있지 않게
  useEffect(() => {
    if (isMac) {
      refreshDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMac]);

  return (
    <SystemAudioContext.Provider
      // eslint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        isCapturing,
        hasAudioTrack,
        error,
        isMac,
        inputDevices,
        selectedDeviceId,
        setSelectedDeviceId,
        refreshDevices,
        startCapture,
        stopCapture,
        getLatestAudio,
      }}
    >
      {children}
    </SystemAudioContext.Provider>
  );
}

export const useSystemAudioContext = () => {
  const ctx = useContext(SystemAudioContext);
  if (ctx === undefined) {
    throw new Error('useSystemAudioContext must be used within a SystemAudioProvider');
  }
  return ctx;
};
