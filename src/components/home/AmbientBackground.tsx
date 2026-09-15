import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PhotographicSky } from './PhotographicSky';

type AmbientBackgroundProps = {
  moving: boolean;
  reducedMotion: boolean;
  videoSrc?: string;
  posterSrc?: string;
};

// Keep foreground layout independent of the eventual film. Until video is
// actually playing, the GPU sky remains visible (also on playback error).
export function AmbientBackground({
  moving,
  reducedMotion,
  videoSrc,
  posterSrc,
}: AmbientBackgroundProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const showVideo = Boolean(videoSrc) && !reducedMotion && !failed;

  // Changing motion preference must freeze the current sky, not recreate its
  // GPU context. Only reset the optional video so it fades in after playing.
  useLayoutEffect(() => {
    if (reducedMotion) {
      setReady(false);
      setFailed(false);
    }
  }, [reducedMotion]);

  useEffect(() => {
    const element = video.current;
    if (!element || !showVideo) return;
    let active = true;
    if (moving) {
      element.play().catch(() => {
        if (active) {
          setFailed(true);
          setReady(false);
        }
      });
    } else {
      element.pause();
    }
    return () => {
      active = false;
      element.pause();
    };
  }, [moving, showVideo]);

  return (
    <div className="home-backdrop" aria-hidden="true">
      <PhotographicSky moving={moving && !(ready && showVideo)} />
      {reducedMotion && posterSrc && !posterFailed && (
        <img
          className="home-poster"
          src={posterSrc}
          alt=""
          onError={() => setPosterFailed(true)}
        />
      )}
      {showVideo && (
        <video
          ref={video}
          className="home-background-video"
          data-ready={ready}
          src={videoSrc}
          poster={posterSrc}
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          disablePictureInPicture
          onPlaying={() => setReady(true)}
          onError={() => {
            setFailed(true);
            setReady(false);
          }}
        />
      )}
      <div className="home-scrim" />
    </div>
  );
}
