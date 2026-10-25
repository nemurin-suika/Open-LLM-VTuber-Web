import {
  createContext, useCallback, useContext, useMemo, useState, ReactNode,
} from 'react';
import { toaster } from '@/components/ui/toaster';
import {
  IMAGE_COMPRESSION_QUALITY_KEY,
  DEFAULT_IMAGE_COMPRESSION_QUALITY,
  IMAGE_MAX_WIDTH_KEY,
  DEFAULT_IMAGE_MAX_WIDTH,
} from '@/hooks/sidebar/setting/use-general-settings';

/**
 * 사용자가 입력창에 직접 붙인 첨부 이미지.
 *
 * 카메라/화면 캡처(use-media-capture)와 달리 네무린이 명시적으로 고른 이미지이므로
 * 전송 시 source='upload' 로 보내고, 백엔드는 source 값을 그대로 스크린샷 태그에
 * 실어 LLM 프롬프트로 넘긴다.
 */
export interface Attachment {
  id: string
  name: string
  /** data URL (data:image/...;base64,...) — 전송 시 백엔드가 콤마 뒤만 디코드한다 */
  data: string
  mime_type: string
}

interface AttachmentContextState {
  attachments: Attachment[]
  /** 파일 선택·붙여넣기·드롭으로 들어온 파일들을 압축해서 추가 */
  addFiles: (files: File[] | FileList) => Promise<void>
  removeAttachment: (id: string) => void
  clearAttachments: () => void
  isProcessing: boolean
}

/** 한 번에 들고 갈 수 있는 첨부 장수 */
const MAX_ATTACHMENTS = 6;

/** 이 크기 이하이고 폭도 기준 이내면 재인코딩 없이 원본을 그대로 쓴다 */
const RAW_KEEP_BYTES = 400 * 1024;

/**
 * 백엔드가 임시 파일로 떨어뜨린 뒤 Read 도구로 다시 읽기 때문에
 * 실제로 읽을 수 있는 형식만 허용한다. SVG 는 제외.
 */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

function makeId(): string {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function getCompressionQuality(): number {
  const stored = localStorage.getItem(IMAGE_COMPRESSION_QUALITY_KEY);
  if (stored) {
    const quality = parseFloat(stored);
    if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) return quality;
  }
  return DEFAULT_IMAGE_COMPRESSION_QUALITY;
}

function getImageMaxWidth(): number {
  const stored = localStorage.getItem(IMAGE_MAX_WIDTH_KEY);
  if (stored) {
    const maxWidth = parseInt(stored, 10);
    if (!Number.isNaN(maxWidth) && maxWidth >= 0) return maxWidth;
  }
  return DEFAULT_IMAGE_MAX_WIDTH;
}

/**
 * 이미지 파일 1개를 첨부 항목으로 변환.
 *
 * 화면 캡처와 같은 설정(최대 폭·압축 품질)을 재사용한다. 작고 폭도 작은 파일은
 * 원본 그대로 두어 PNG 선명함을 유지하고, 큰 파일만 JPEG 로 줄인다.
 */
async function fileToAttachment(file: File): Promise<Attachment | null> {
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return null;

  const maxWidth = getImageMaxWidth();

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  const name = file.name || `pasted-${Date.now()}.png`;

  // 디코드 실패(지원 안 되는 세부 포맷 등)해도 원본을 그대로 넘겨본다.
  if (!bitmap) {
    return {
      id: makeId(), name, data: await readAsDataURL(file), mime_type: mime,
    };
  }

  const needResize = maxWidth > 0 && bitmap.width > maxWidth;
  if (!needResize && file.size <= RAW_KEEP_BYTES) {
    bitmap.close?.();
    return {
      id: makeId(), name, data: await readAsDataURL(file), mime_type: mime,
    };
  }

  let { width, height } = bitmap;
  if (needResize) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return {
      id: makeId(), name, data: await readAsDataURL(file), mime_type: mime,
    };
  }

  // JPEG 는 투명도를 못 담으므로 투명 배경이 검게 나오지 않도록 흰색을 먼저 깐다.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return {
    id: makeId(),
    name,
    data: canvas.toDataURL('image/jpeg', getCompressionQuality()),
    mime_type: 'image/jpeg',
  };
}

const AttachmentContext = createContext<AttachmentContextState | null>(null);

export function AttachmentProvider({ children }: { children: ReactNode }): JSX.Element {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addFiles = useCallback(async (files: File[] | FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    const images = list.filter((f) => (f.type || '').toLowerCase().startsWith('image/'));
    if (images.length === 0) {
      toaster.create({
        title: '이미지 파일만 첨부할 수 있어',
        type: 'error',
        duration: 2500,
      });
      return;
    }

    setIsProcessing(true);
    try {
      const converted: Attachment[] = [];
      let rejected = 0;
      // 순차 처리 — 큰 스크린샷 여러 장을 동시에 디코드하면 메모리가 튄다.
      for (const file of images) {
        // eslint-disable-next-line no-await-in-loop
        const att = await fileToAttachment(file);
        if (att) converted.push(att);
        else rejected += 1;
      }

      if (rejected > 0) {
        toaster.create({
          title: `지원하지 않는 이미지 형식 ${rejected}개는 건너뛰었어`,
          type: 'warning',
          duration: 2500,
        });
      }

      if (converted.length > 0) {
        setAttachments((prev) => {
          const merged = [...prev, ...converted];
          if (merged.length > MAX_ATTACHMENTS) {
            toaster.create({
              title: `첨부는 한 번에 ${MAX_ATTACHMENTS}장까지야`,
              type: 'warning',
              duration: 2500,
            });
            return merged.slice(0, MAX_ATTACHMENTS);
          }
          return merged;
        });
      }
    } catch (error) {
      console.error('[attachment] 변환 실패:', error);
      toaster.create({
        title: '이미지를 읽지 못했어',
        type: 'error',
        duration: 2500,
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const value = useMemo<AttachmentContextState>(() => ({
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    isProcessing,
  }), [attachments, addFiles, removeAttachment, clearAttachments, isProcessing]);

  return (
    <AttachmentContext.Provider value={value}>
      {children}
    </AttachmentContext.Provider>
  );
}

export function useAttachments(): AttachmentContextState {
  const ctx = useContext(AttachmentContext);
  if (!ctx) {
    throw new Error('useAttachments must be used within AttachmentProvider');
  }
  return ctx;
}
