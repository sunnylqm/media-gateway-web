import { Film, Loader2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import {
  compressVideo,
  formatFileSize,
  isCompressionSupported,
  MAX_VIDEO_BYTES,
} from '../lib/videoCompression';

export type VideoCompressRequest = {
  file: File;
  maxBytes?: number;
  onProceed: (file: File) => void;
  onCancel?: () => void;
};

interface VideoCompressDialogProps {
  request: VideoCompressRequest | null;
  onOpenChange?: (open: boolean) => void;
}

export function VideoCompressDialog({
  request,
  onOpenChange,
}: VideoCompressDialogProps) {
  const { t } = useI18n();
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const maxBytes = request?.maxBytes ?? MAX_VIDEO_BYTES;
  const supported = isCompressionSupported();

  useEffect(() => {
    if (!request) return;
    setCompressing(false);
    setProgress(0);
    setError('');
    setAbortController(null);
  }, [request]);

  const handleCancel = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
    request?.onCancel?.();
    onOpenChange?.(false);
  }, [abortController, request, onOpenChange]);

  const handleCompress = async () => {
    if (!request) return;
    setError('');
    setCompressing(true);
    setProgress(0);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const compressedFile = await compressVideo(request.file, {
        maxBytes,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setCompressing(false);
      onOpenChange?.(false);
      request.onProceed(compressedFile);
    } catch (err) {
      if (controller.signal.aborted) {
        setCompressing(false);
        return;
      }
      setCompressing(false);
      setError(err instanceof Error ? err.message : t('composer.errorUpload'));
    }
  };

  if (!request) return null;

  return (
    <Dialog.Root
      open={Boolean(request)}
      onOpenChange={(next) => {
        if (!next && !compressing) handleCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content small">
          <div className="dialog-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Film size={20} />
              <Dialog.Title>{t('videoCompress.title')}</Dialog.Title>
            </div>
            <Dialog.Close
              className="icon-button"
              type="button"
              disabled={compressing}
              onClick={handleCancel}
            >
              <X size={18} />
            </Dialog.Close>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '14px',
              fontSize: '14px',
              lineHeight: 1.6,
            }}
          >
            <div>
              <p style={{ margin: '0 0 6px 0' }}>
                {t('videoCompress.desc', {
                  currentSize: formatFileSize(request.file.size),
                  maxSize: formatFileSize(maxBytes),
                })}
              </p>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                {t('videoCompress.askPrompt')}
              </p>
            </div>

            {!supported && (
              <div
                className="banner-error"
                role="alert"
                style={{ margin: 0, padding: '10px 12px' }}
              >
                {t('videoCompress.unsupported', {
                  maxSize: formatFileSize(maxBytes),
                })}
              </div>
            )}

            {error && (
              <div
                className="banner-error"
                role="alert"
                style={{ margin: 0, padding: '10px 12px' }}
              >
                {t('videoCompress.compressFailed', { error })}
              </div>
            )}

            {compressing && (
              <div className="video-compress-box">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    <Loader2
                      size={14}
                      className="loader small"
                      style={{ display: 'inline-block' }}
                    />
                    {t('videoCompress.compressing', { percent: progress })}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {progress}%
                  </span>
                </div>
                <div className="video-compress-bar">
                  <div
                    className="video-compress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: 'var(--muted)',
                  }}
                >
                  {t('videoCompress.compressingHint')}
                </div>
              </div>
            )}
          </div>

          <div className="dialog-actions" style={{ marginTop: '20px' }}>
            <button
              className="button secondary"
              type="button"
              disabled={compressing}
              onClick={handleCancel}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={compressing || !supported}
              onClick={handleCompress}
            >
              {compressing ? (
                <>
                  <Loader2 size={14} className="loader small" />
                  <span>
                    {t('videoCompress.compressing', { percent: progress })}
                  </span>
                </>
              ) : error ? (
                t('videoCompress.retry')
              ) : (
                t('videoCompress.confirm')
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
