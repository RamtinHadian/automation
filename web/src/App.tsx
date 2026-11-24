import React from 'react';
import { Routes, Route, Navigate } from './lib/router';
import { AppProvider } from './context/AppContext';
import { FormConfigRuntime } from './components/common/FormConfigRuntime';
import { useAppContext } from './context/AppContext';
import UserPanel from './pages/UserPanel';
import AdminPanel from './pages/AdminPanel';
import { LoginPage } from './pages/LoginPage';
import { PortalPage } from './pages/PortalPage';
const FieldPage = React.lazy(() => import('./pages/FieldPage').then((m) => ({ default: m.FieldPage })));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const LeadPage = React.lazy(() => import('./pages/LeadPage').then((m) => ({ default: m.LeadPage })));
import { useCompanyName } from './lib/useCompanyName';
import { NotificationPopups } from './components/common/NotificationPopups';
import { DemoBanner } from './components/common/DemoBanner';
import { DemoNotifyKey } from './components/common/DemoNotifyKey';
import { DayNightToggle } from './components/common/DayNightToggle';
import { ErrorPopups } from './components/common/ErrorPopups';
import { LicenseGate } from './components/common/LicenseGate';
import { ConfirmHost } from './lib/confirmDialog';
import { CallFromHost } from './lib/callFrom';
import { CalculatorHost } from './components/common/Calculator';

/** An address the program does not know: it may be the (renamed) address of the marketer's quick-registration page; otherwise back to the start. */
function SlugGate() {
  const seg = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const [state, setState] = React.useState<'wait' | 'field' | 'no'>(/^[a-z0-9-]{3,30}$/.test(seg) ? 'wait' : 'no');
  React.useEffect(() => {
    if (state !== 'wait') return;
    fetch(`/api/public/field-slug?p=${encodeURIComponent(seg)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setState(j.match ? 'field' : 'no'))
      .catch(() => setState('no'));
  }, [seg, state]);
  if (state === 'wait') return null;
  if (state === 'field') return <React.Suspense fallback={null}><FieldPage /></React.Suspense>;
  return <Navigate to="/" replace />;
}

function AppRoutes() {
  const companyName = useCompanyName();
  // the browser tab says whose automation this is
  React.useEffect(() => {
    if (companyName) document.title = `${companyName} | سامانه اتوماسیون`;
  }, [companyName]);
  const { loggedInUser, staffList, ready, loginWithCredentials } = useAppContext();

  const handleAdminLogin = () => {
    // Navigate to admin panel directly via hash
    window.location.href = '/admin';
  };

  if (!ready) return null;

  return (
    <>
    <DemoBanner />
    <DemoNotifyKey />
    <CalculatorHost />
    <FormConfigRuntime />
    {loggedInUser && <NotificationPopups />}
    <Routes>
      <Route
        path="/"
        element={
          loggedInUser ? (
            <UserPanel />
          ) : (
            <>
              {/* the day / night switch belongs to the sign-in page only (the other pages have their own) */}
              <DayNightToggle className="fixed top-4 left-4 z-50 p-2.5 rounded-2xl bg-white/80 hover:bg-white text-[#6E1B1B] border border-[#EBDBCE] shadow-md" />
            <LoginPage
              staffList={staffList}
              onLogin={async (identifier, password, code) => {
                const result = await loginWithCredentials(identifier, password, false, code);
                return result.ok ? null : result.error;
              }}
              onAdminLogin={handleAdminLogin}
            />
            </>
          )
        }
      />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/support" element={<PortalPage />} />
      <Route path="/register" element={<React.Suspense fallback={null}><RegisterPage /></React.Suspense>} />
      <Route path="/lead" element={<React.Suspense fallback={null}><LeadPage /></React.Suspense>} />
      <Route path="*" element={<SlugGate />} />
    </Routes>
    </>
  );
}

export function App() {
  return (
    <LicenseGate>
      <ErrorPopups />
      <ConfirmHost />
      <CallFromHost />
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </LicenseGate>
  );
}

export default App;
