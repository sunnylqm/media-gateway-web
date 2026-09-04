import { describe, expect, it } from 'bun:test';
import {
  formatFileSize,
  isCompressionSupported,
  isOversizedVideo,
  isVideoFile,
  MAX_VIDEO_BYTES,
} from './videoCompression';

describe('videoCompression utilities', () => {
  it('correctly identifies video files by mime or extension', () => {
    expect(isVideoFile(new File([''], 'test.mp4', { type: 'video/mp4' }))).toBe(
      true,
    );
    expect(
      isVideoFile(new File([''], 'test.webm', { type: 'video/webm' })),
    ).toBe(true);
    expect(isVideoFile(new File([''], 'video.mov', { type: '' }))).toBe(true);
    expect(
      isVideoFile(
        new File([''], 'clip.mkv', { type: 'application/octet-stream' }),
      ),
    ).toBe(true);
    expect(
      isVideoFile(new File([''], 'image.png', { type: 'image/png' })),
    ).toBe(false);
    expect(
      isVideoFile(new File([''], 'document.pdf', { type: 'application/pdf' })),
    ).toBe(false);
  });

  it('detects oversized videos beyond the threshold', () => {
    expect(MAX_VIDEO_BYTES).toBe(50 * 1024 * 1024);

    // 53,282,501 bytes is ~50.8MB (> 50MB)
    const largeVideo = new File([new Uint8Array(100)], 'large.mp4', {
      type: 'video/mp4',
    });
    Object.defineProperty(largeVideo, 'size', { value: 53_282_501 });

    const normalVideo = new File([new Uint8Array(100)], 'normal.mp4', {
      type: 'video/mp4',
    });
    Object.defineProperty(normalVideo, 'size', { value: 20 * 1024 * 1024 });

    const largeImage = new File([new Uint8Array(100)], 'huge.png', {
      type: 'image/png',
    });
    Object.defineProperty(largeImage, 'size', { value: 60 * 1024 * 1024 });

    expect(isOversizedVideo(largeVideo)).toBe(true);
    expect(isOversizedVideo(normalVideo)).toBe(false);
    // Non-video files are never flagged as oversized video
    expect(isOversizedVideo(largeImage)).toBe(false);

    // Custom maxBytes
    expect(isOversizedVideo(normalVideo, 10 * 1024 * 1024)).toBe(true);
  });

  it('formats file sizes accurately for display', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(249_915)).toBe('244 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50 MB');
    expect(formatFileSize(53_282_501)).toBe('50.8 MB');
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('reports compression capability based on WebCodecs availability', () => {
    // In bun test environment, window.VideoEncoder is undefined
    expect(isCompressionSupported()).toBe(false);
  });
});
