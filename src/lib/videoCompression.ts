export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const TARGET_VIDEO_BYTES = 42 * 1024 * 1024; // 42 MB

const videoExtensionPattern = /\.(mp4|mov|webm|mkv|avi|m4v|3gp|wmv|flv)$/i;

export function isVideoFile(file: File): boolean {
  if (file.type?.toLowerCase().startsWith('video/')) {
    return true;
  }
  return videoExtensionPattern.test(file.name);
}

export function isOversizedVideo(
  file: File,
  maxBytes = MAX_VIDEO_BYTES,
): boolean {
  return isVideoFile(file) && file.size > maxBytes;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1).replace(/\.0$/, '')} GB`;
  }
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1).replace(/\.0$/, '')} MB`;
  }
  if (bytes >= 1024) {
    const kb = bytes / 1024;
    return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1).replace(/\.0$/, '')} KB`;
  }
  return `${bytes} B`;
}

export function isCompressionSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder !== 'undefined' &&
    typeof window.VideoDecoder !== 'undefined'
  );
}

export type CompressVideoOptions = {
  maxBytes?: number;
  targetBytes?: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

function measureVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(15);
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : 15);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(15);
    };
  });
}

export async function compressVideo(
  file: File,
  options?: CompressVideoOptions,
): Promise<File> {
  const maxBytes = options?.maxBytes ?? MAX_VIDEO_BYTES;
  const targetBytes = options?.targetBytes ?? TARGET_VIDEO_BYTES;

  // Lazy load mediabunny so it is only loaded when compression is needed
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
  } = await import('mediabunny');

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  let duration = 0;
  try {
    duration = await input.computeDuration();
  } catch {
    try {
      duration = (await input.getDurationFromMetadata()) ?? 0;
    } catch {
      duration = 0;
    }
  }

  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    duration = await measureVideoDuration(file);
  }

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error('No video track found in file');
  }

  const origWidth = (await videoTrack.getDisplayWidth()) || 1920;
  const origHeight = (await videoTrack.getDisplayHeight()) || 1080;

  // Choose max bounds based on duration:
  // For long videos (>60s), 720p is safer and encodes much faster.
  // For shorter videos, 1080p produces great quality within 42MB.
  const maxW = duration > 60 ? 1280 : 1920;
  const maxH = duration > 60 ? 720 : 1080;

  const scale = Math.min(1, maxW / origWidth, maxH / origHeight);
  const width = Math.max(2, Math.round((origWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.round((origHeight * scale) / 2) * 2);

  // Bitrate calculation
  const effectiveDuration = Math.max(duration || 10, 1);
  const totalBits = targetBytes * 8;
  const audioBitrate = 128_000;
  const audioBitsTotal = audioBitrate * effectiveDuration;
  const availableVideoBits = Math.max(
    totalBits - audioBitsTotal,
    totalBits * 0.75,
  );
  let targetVideoBitrate = Math.floor(availableVideoBits / effectiveDuration);

  // Bounds for target video bitrate:
  // Min 600 kbps, Max 6 Mbps
  targetVideoBitrate = Math.max(
    600_000,
    Math.min(targetVideoBitrate, 6_000_000),
  );

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      width,
      height,
      fit: 'contain',
      codec: 'avc',
      quality: new Quality({ bitrate: targetVideoBitrate }),
    },
    audio: {
      codec: 'aac',
      quality: new Quality({ bitrate: audioBitrate }),
    },
  });

  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks
      .map((d) => `${d.track.type}: ${d.reason}`)
      .join(', ');
    throw new Error(`Video cannot be converted: ${reasons}`);
  }

  if (options?.signal) {
    options.signal.addEventListener('abort', () => {
      void conversion.cancel();
    });
  }

  if (options?.onProgress) {
    conversion.onProgress = (p) => {
      options.onProgress?.(Math.min(99, Math.round(p * 100)));
    };
  }

  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Compressed output is empty');
  }

  // Safety second pass if encoder overshot target beyond maxBytes
  if (buffer.byteLength > maxBytes) {
    const fallbackTargetBytes = Math.floor(maxBytes * 0.65);
    const fallbackDuration = effectiveDuration;
    const fallbackVideoBitrate = Math.max(
      400_000,
      Math.floor((fallbackTargetBytes * 8 * 0.75) / fallbackDuration),
    );

    const fallbackInput = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    const fallbackOutput = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });

    const fallbackWidth = Math.max(
      2,
      Math.round(Math.min(width, 1280) / 2) * 2,
    );
    const fallbackHeight = Math.max(
      2,
      Math.round(Math.min(height, 720) / 2) * 2,
    );

    const fallbackConv = await Conversion.init({
      input: fallbackInput,
      output: fallbackOutput,
      video: {
        width: fallbackWidth,
        height: fallbackHeight,
        fit: 'contain',
        codec: 'avc',
        quality: new Quality({ bitrate: fallbackVideoBitrate }),
      },
      audio: {
        codec: 'aac',
        quality: new Quality({ bitrate: 96_000 }),
      },
    });

    if (fallbackConv.isValid) {
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          void fallbackConv.cancel();
        });
      }
      if (options?.onProgress) {
        fallbackConv.onProgress = (p) => {
          options.onProgress?.(Math.min(99, Math.round(p * 100)));
        };
      }
      await fallbackConv.execute();
      const fallbackBuffer = fallbackOutput.target.buffer;
      if (fallbackBuffer && fallbackBuffer.byteLength > 0) {
        options?.onProgress?.(100);
        const outName = `${file.name.replace(/\.[^/.]+$/, '')}.mp4`;
        return new File([fallbackBuffer], outName, { type: 'video/mp4' });
      }
    }
  }

  options?.onProgress?.(100);
  const outName = `${file.name.replace(/\.[^/.]+$/, '')}.mp4`;
  return new File([buffer], outName, { type: 'video/mp4' });
}
