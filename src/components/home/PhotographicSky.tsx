import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { starLayers } from '../../lib/ambient';
import { seedToken } from '../../lib/sky/g2/recipe';
import { getChoice } from '../../lib/sky/g2/selection';
import type { SkyRenderer } from '../../lib/sky/renderer';

// Pick one engine, then lazily load it. Legacy links never load the G2 renderer.
export function PhotographicSky({ moving }: { moving: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SkyRenderer | null>(null);
  const motion = useRef(moving);
  const [status, setStatus] = useState('pending');

  useLayoutEffect(() => {
    motion.current = moving;
    renderer.current?.setMoving(moving);
  }, [moving]);

  useEffect(() => {
    let active = true;
    const state = (ready: boolean) => {
      if (active) setStatus(ready ? 'webgl2' : 'fallback');
    };
    async function load() {
      const choice = getChoice();
      let instance: SkyRenderer;
      if (choice.version === 'g2') {
        const { createRenderer } = await import('../../lib/sky/g2/renderer');
        if (!active || !canvas.current) return;
        canvas.current.dataset.engine = 'g2';
        canvas.current.dataset.scene = choice.recipe.family;
        canvas.current.dataset.seed = seedToken(choice.recipe.seed);
        canvas.current.dataset.palette = choice.recipe.paletteName;
        instance = createRenderer(canvas.current, choice.recipe, state);
      } else {
        const { createSkyRenderer } = await import('../../lib/sky/renderer');
        const { getSkyRecipe, skySeedToken } = await import(
          '../../lib/sky/presets'
        );
        if (!active || !canvas.current) return;
        const recipe = getSkyRecipe();
        canvas.current.dataset.engine = 'g1';
        canvas.current.dataset.scene = recipe.preset.id;
        canvas.current.dataset.seed =
          recipe.seed === null ? 'canonical' : skySeedToken(recipe.seed);
        instance = createSkyRenderer(canvas.current, state);
      }
      renderer.current = instance;
      instance.setMoving(motion.current);
    }
    load().catch(() => {
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
