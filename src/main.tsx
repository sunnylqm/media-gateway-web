import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StudioRouteBoundary } from './components/studio/RouteBoundary';
import { LocaleProvider, useI18n } from './i18n';
import { studioEnabled } from './lib/studio/config';
import { studioMessage } from './lib/studio/messages';
import { AdminConsole } from './pages/AdminConsole';
import { AdminLogin } from './pages/AdminLogin';
import { Home } from './pages/Home';
import { TenantConsole } from './pages/TenantConsole';
import { TenantLogin } from './pages/TenantLogin';
import './styles.css';
import './styles/brand.css';

const GuidedStudio = lazy(() => import('./pages/GuidedStudio'));

function StudioLoading() {
  const { locale } = useI18n();
  return (
    <div className="content" role="status">
      {studioMessage(locale, 'loading')}
    </div>
  );
}

function App() {
  return (
    <LocaleProvider>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/app/login" element={<TenantLogin />} />
            <Route
              path="/app/register"
              element={<Navigate to="/app/login" replace />}
            />
            {studioEnabled && (
              <Route
                path="/app/create/*"
                element={
                  <StudioRouteBoundary>
                    <Suspense fallback={<StudioLoading />}>
                      <GuidedStudio />
                    </Suspense>
                  </StudioRouteBoundary>
                }
              />
            )}
            <Route path="/app/*" element={<TenantConsole />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/*" element={<AdminConsole />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LocaleProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
