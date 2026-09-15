import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { starLayers } from '../../lib/ambient';
import { getSkyPreset } from '../../lib/sky/presets';
import type { SkyRenderer } from '../../lib/sky/renderer';

// Dynamically load the GPU code; the primary action never waits for a context.
export function PhotographicSky({ moving }: { moving: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SkyRenderer | null>(null);
  const motion = useRef(moving);
  const [status, setStatus] = useState('pending');

  // Stop the imperative loop in the same commit as the visible motion state,
  // before another browser animation frame can be submitted.
  useLayoutEffect(() => {
    motion.current = moving;
    renderer.current?.setMoving(moving);
  }, [moving]);

  useEffect(() => {
    let active = true;
    import('../../lib/sky/renderer')
      .then(({ createSkyRenderer }) => {
        if (!active || !canvas.current) return;
        canvas.current.dataset.scene = getSkyPreset().id;
        const instance = createSkyRenderer(canvas.current, (ready) => {
          if (active) setStatus(ready ? 'webgl2' : 'fallback');
        });
        renderer.current = instance;
        instance.setMoving(motion.current);
      })
      .catch(() => {
        if (active) setStatus('fallback');
      });
    return () => {
      active = false;
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  return (
    <div className="home-sky" data-moving={moving} aria-hidden="true">
      <div className="sky-fallback" data-moving={moving && status !== 'webgl2'}>
        <div className="home-nebula" />
        {starLayers.map((backgroundImage, index) => (
          <div
            key={backgroundImage}
            className={`home-stars home-stars-${index}`}
            style={{ backgroundImage }}
          />
        ))}
      </div>
      <canvas
        ref={canvas}
        className="home-galaxy"
        data-renderer={status}
        tabIndex={-1}
      />
    </div>
  );
}
