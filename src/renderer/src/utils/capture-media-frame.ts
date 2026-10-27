interface FrameCapture {
  grabFrame: () => Promise<ImageBitmap>;
}

interface CaptureOptions {
  maxWidth: number;
  quality: number;
}

function grabBitmap(track: MediaStreamTrack): Promise<ImageBitmap | null> {
  const ImageCaptureConstructor = (window as unknown as {
    ImageCapture?: new (videoTrack: MediaStreamTrack) => FrameCapture;
  }).ImageCapture;
  if (!ImageCaptureConstructor) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let timer: number;
    const finish = (bitmap: ImageBitmap | null) => {
      if (settled) {
        bitmap?.close();
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      resolve(bitmap);
    };
    timer = window.setTimeout(() => finish(null), 1000);
    try {
      new ImageCaptureConstructor(track).grabFrame().then(finish, () => finish(null));
    } catch {
      finish(null);
    }
  });
}

function encodeFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  { maxWidth, quality }: CaptureOptions,
): string {
  if (!sourceWidth || !sourceHeight) throw new Error('No video frame available');
  const scale = maxWidth > 0 ? Math.min(1, maxWidth / sourceWidth) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get canvas context');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function grabVideo(stream: MediaStream, options: CaptureOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const track = stream.getVideoTracks()[0];
    const controller = new AbortController();
    let settled = false;
    let timer: number;

    const cleanup = () => {
      window.clearTimeout(timer);
      controller.abort();
      video.pause();
      video.srcObject = null;
      video.remove();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Video frame capture failed or timed out'));
    };
    const capture = () => {
      if (settled || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      try {
        const data = encodeFrame(video, video.videoWidth, video.videoHeight, options);
        settled = true;
        cleanup();
        resolve(data);
      } catch {
        fail();
      }
    };

    timer = window.setTimeout(fail, 2000);
    const { signal } = controller;
    video.addEventListener('loadeddata', capture, { signal });
    video.addEventListener('canplay', capture, { signal });
    video.addEventListener('error', fail, { signal });
    track.addEventListener('ended', fail, { signal });
    try {
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('aria-hidden', 'true');
      video.style.cssText = 'position:fixed;left:-10000px;width:1px;height:1px;pointer-events:none';
      video.srcObject = stream;
      document.body.appendChild(video);
      video.play().then(capture, fail);
    } catch {
      fail();
    }
  });
}

export async function captureMediaFrame(
  stream: MediaStream,
  options: CaptureOptions,
): Promise<string> {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') throw new Error('No live video track available');

  const bitmap = await grabBitmap(track);
  if (bitmap) {
    try {
      return encodeFrame(bitmap, bitmap.width, bitmap.height, options);
    } catch {
      return await grabVideo(stream, options);
    } finally {
      bitmap.close();
    }
  }
  return grabVideo(stream, options);
}
