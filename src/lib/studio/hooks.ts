import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useI18n } from '../../i18n';
import type { StudioClient } from './client';
import { type Failure, failureOf, ProjectController } from './controller';
import { type StudioCopy, studioMessage } from './messages';

export function useStudioCopy(): StudioCopy {
  const { locale } = useI18n();
  return useCallback(
    (key, values) => studioMessage(locale, key, values),
    [locale],
  );
}

export function useProject(
  client: StudioClient,
  id: string,
  revision?: number,
) {
  const controller = useMemo(
    () => new ProjectController(client, id, revision),
    [client, id, revision],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.load();
    return () => controller.dispose();
  }, [controller]);
  return { state, controller };
}

// load must have stable identity. Obsolete responses never update the view.
export function useStudioResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setBusy(true);
    setValue(null);
    setError(null);
    load(abort.signal).then(
      (result) => {
        if (active) {
          setValue(result);
          setBusy(false);
        }
      },
      (reason) => {
        if (active) {
          setError(failureOf(reason));
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
      abort.abort();
    };
  }, [load, attempt]);
  const retry = useCallback(() => setAttempt((old) => old + 1), []);
  return { value, error, busy, retry };
}
