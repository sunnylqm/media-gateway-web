import { useEffect, useRef, useState } from 'react';
import { starLayers } from '../../lib/ambient';

type AmbientBackgroundProps = {
  moving: boolean;
  reducedMotion: boolean;
  videoSrc?: string;
  posterSrc?: string;
};

// Keep foreground layout independent of the eventual film. Until video is
// actually playing, the same quiet sky remains visible (also on playback error).
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
      <div className="home-sky" data-moving={moving && !(ready && showVideo)}>
        <div className="home-nebula" />
        {starLayers.map((backgroundImage, index) => (
          <div
            key={backgroundImage}
            className={`home-stars home-stars-${index}`}
            style={{ backgroundImage }}
          />
        ))}
      </div>
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
