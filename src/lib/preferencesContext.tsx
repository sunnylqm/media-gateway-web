import {
  createContext,
  type ReactNode,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { api } from '../api';
import {
  defaultPreferences,
  type PlaygroundLayout,
  type Preferences,
  playgroundLayoutPatch,
  readMirroredPreferences,
  readPreferences,
  writeMirroredPreferences,
} from './preferences';

type PreferencesStore = {
  preferences: Preferences;
  // adopt takes the document the profile carried. The server is the authority:
  // whatever the mirror painted first is replaced by what the account holds.
  adopt: (document: unknown) => void;
  setPlaygroundLayout: (layout: PlaygroundLayout) => void;
};

const PreferencesContext = createContext<PreferencesStore>({
  preferences: defaultPreferences,
  adopt: () => {},
  setPlaygroundLayout: () => {},
});

// persist is off where there is no account to save to. The administrator
// console reuses the playground pages but signs in as the administrator, not
// as a user, so its copy of the setting stays in this browser.
export function PreferencesProvider({
  children,
  persist = true,
}: {
  children: ReactNode;
  persist?: boolean;
}) {
  // Painted from the mirror on the first render, before the profile request
  // returns, so the layout does not jump once it does.
  const [preferences, setPreferences] = useState<Preferences>(
    readMirroredPreferences,
  );

  const adopt = useCallback((document: unknown) => {
    const served = readPreferences(document);
    writeMirroredPreferences(served);
    setPreferences((current) =>
      current.playgroundLayout === served.playgroundLayout ? current : served,
    );
  }, []);

  const setPlaygroundLayout = useCallback(
    (layout: PlaygroundLayout) => {
      // The swap animates, so it has to be a transition: React only runs a view
      // transition for an update that is one.
      startTransition(() => {
        setPreferences((current) => ({ ...current, playgroundLayout: layout }));
      });
      writeMirroredPreferences({
        ...readMirroredPreferences(),
        playgroundLayout: layout,
      });
      if (!persist) return;
      api('/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(playgroundLayoutPatch(layout)),
      }).catch(() => {
        // The setting is where the person just put it and the mirror agrees, so
        // a failed save is not worth pulling the layout back out from under
        // them. The next successful save, or the next sign-in, reconciles it.
      });
    },
    [persist],
  );

  const store = useMemo<PreferencesStore>(
    () => ({ preferences, adopt, setPlaygroundLayout }),
    [preferences, adopt, setPlaygroundLayout],
  );

  return (
    <PreferencesContext.Provider value={store}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesStore {
  return useContext(PreferencesContext);
}
