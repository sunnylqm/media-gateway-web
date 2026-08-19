import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminConsole } from './pages/AdminConsole';
import { AdminLogin } from './pages/AdminLogin';
import { TenantConsole } from './pages/TenantConsole';
import { TenantLogin } from './pages/TenantLogin';
import './styles.css';

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/app/login" element={<TenantLogin />} />
          <Route path="/app/register" element={<Navigate to="/app/login" replace />} />
          <Route path="/app/*" element={<TenantConsole />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/*" element={<AdminConsole />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
