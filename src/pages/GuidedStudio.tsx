import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { api, gatewayURL } from '../api';
import { LanguageToggle } from '../components/LanguageSwitch';
import { StudioNotice } from '../components/studio/Notice';
import { GuidedProject } from '../components/studio/ProjectView';
import { SeedBrowser } from '../components/studio/SeedBrowser';
import { useI18n } from '../i18n';
import { createStudioClient } from '../lib/studio/client';
import { CommandJournal } from '../lib/studio/commands';
import { useStudioCopy } from '../lib/studio/hooks';
import { createPlanningClient } from '../lib/studio/planningClient';
import { PlanningJournal } from '../lib/studio/planningJournal';
import { createProductionClient } from '../lib/studio/productionClient';
import { productionCopy } from '../lib/studio/productionCopy';
import { StudioSessionController } from '../lib/studio/session';
import '../styles/studio.css';

// Identity checks have a separate lifecycle from replace-on-load resources
// such as discovery. Same-account focus must not reset local creative choices.
export default function GuidedStudio() {
  const t = useStudioCopy();
  const controller = useMemo(() => new StudioSessionController(api), []);
  const session = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.refresh();
    window.addEventListener('focus', controller.refresh);
    return () => {
      window.removeEventListener('focus', controller.refresh);
      controller.dispose();
    };
  }, [controller]);
  if (session.error === 'auth') return <Navigate to="/app/login" replace />;
  const blocked = session.busy || session.error !== null;
  return (
    <div className="studio-page">
      <header className="studio-topbar">
        <Link to="/app" className="studio-text-button">
          ← {t('back')}
        </Link>
        <strong>{t('title')}</strong>
        <LanguageToggle />
      </header>
      <main className="studio-main">
        {session.busy && <p role="status">{t('loading')}</p>}
        {session.error && (
          <StudioNotice error={session.error} retry={controller.refresh} />
        )}
        <div hidden={blocked} inert={blocked}>
          {session.value?.user.id && (
            <StudioSession
              key={session.value.user.id}
              userID={session.value.user.id}
              controller={controller}
              active={!blocked}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function StudioSession({
  userID,
  controller,
  active,
}: {
  userID: string;
  controller: StudioSessionController;
  active: boolean;
}) {
  const t = useStudioCopy();
  const client = useMemo(
    () => createStudioClient(controller.forUser(userID)),
    [controller, userID],
  );
  const { locale } = useI18n();
  const productionT = productionCopy(locale);
  const productionClient = useMemo(
    () => createProductionClient(controller.forUser(userID)),
    [controller, userID],
  );
  const planningClient = useMemo(
    () => createPlanningClient(controller.forUser(userID)),
    [controller, userID],
  );
  const planningJournal = useMemo(() => {
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      /* Optional storage. */
    }
    return new PlanningJournal(gatewayURL, userID, storage);
  }, [userID]);
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
        <p>{productionT('boundary')}</p>
        <small>{t('chinese')}</small>
      </div>
      <Routes>
        <Route
          index
          element={<SeedBrowser client={client} journal={journal} />}
        />
        <Route
          path="projects/:projectId"
          element={
            <GuidedProject
              client={client}
              journal={journal}
              planningClient={planningClient}
              planningJournal={planningJournal}
              productionClient={productionClient}
              userID={userID}
              active={active}
            />
          }
        />
        <Route path="*" element={<Navigate to="/app/create" replace />} />
      </Routes>
      <footer className="studio-footer">{productionT('privacy')}</footer>
    </>
  );
}
