import { useCallback, useEffect, useMemo } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { api, gatewayURL } from '../api';
import { LanguageToggle } from '../components/LanguageSwitch';
import { StudioNotice } from '../components/studio/Notice';
import { GuidedProject } from '../components/studio/ProjectView';
import { SeedBrowser } from '../components/studio/SeedBrowser';
import { createStudioClient } from '../lib/studio/client';
import { CommandJournal } from '../lib/studio/commands';
import { useStudioCopy, useStudioResource } from '../lib/studio/hooks';
import '../styles/studio.css';

const client = createStudioClient(api);
type SessionIdentity = { user: { id: string } };

// Immersive route, independent of the media-history polling screen. The only
// identity source is the same authenticated /me endpoint used by that screen.
export default function GuidedStudio() {
  const t = useStudioCopy();
  const loadIdentity = useCallback(
    (signal: AbortSignal) => api<SessionIdentity>('/v1/auth/me', { signal, cache: 'no-store' }),
    [],
  );
  const session = useStudioResource(loadIdentity);
  const refreshSession = session.retry;
  useEffect(() => {
    // Another tab may have switched accounts. Drop the old account's view
    // while validating the current session before restoring the project.
    window.addEventListener('focus', refreshSession);
    return () => window.removeEventListener('focus', refreshSession);
  }, [refreshSession]);
  if (session.error === 'auth') return <Navigate to="/app/login" replace />;
  return (
    <div className="studio-page">
      <header className="studio-topbar">
        <Link to="/app" className="studio-text-button">← {t('back')}</Link>
        <strong>{t('title')}</strong>
        <LanguageToggle />
      </header>
      <main className="studio-main">
        {session.busy && <p role="status">{t('loading')}</p>}
        {session.error && <StudioNotice error={session.error} retry={session.retry} />}
        {session.value?.user.id && <StudioSession key={session.value.user.id} userID={session.value.user.id} />}
      </main>
    </div>
  );
}

function StudioSession({ userID }: { userID: string }) {
  const t = useStudioCopy();
  const journal = useMemo(() => {
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      // Browser storage is optional; project data lives on the server.
    }
    return new CommandJournal(gatewayURL, userID, storage);
  }, [userID]);
  return (
    <>
      <div className="studio-boundary">
        <strong>{t('prototype')}</strong>
        <p>{t('limitation')}</p>
        <small>{t('chinese')}</small>
      </div>
      <Routes>
        <Route index element={<SeedBrowser client={client} journal={journal} />} />
        <Route path="projects/:projectId" element={<GuidedProject client={client} journal={journal} />} />
        <Route path="*" element={<Navigate to="/app/create" replace />} />
      </Routes>
      <footer className="studio-footer">{t('privacy')}</footer>
    </>
  );
}
