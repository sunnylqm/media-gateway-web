import { useEffect, useState } from 'react';

export function useAmbientMotion() {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    preference.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    // Reconcile changes between the initial render and subscription.
    updatePreference();
    updateVisibility();
    return () => {
      preference.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  return {
    paused,
    reducedMotion,
    moving: !paused && !reducedMotion && visible,
    toggle: () => setPaused((value) => !value),
  };
}
