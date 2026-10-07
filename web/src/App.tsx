import React from 'react';
import { Routes, Route, Navigate } from './lib/router';
import { AppProvider } from './context/AppContext';
import { useAppContext } from './context/AppContext';
import UserPanel from './pages/UserPanel';
import AdminPanel from './pages/AdminPanel';
import { LoginPage } from './pages/LoginPage';
import { PortalPage } from './pages/PortalPage';
import { NotificationPopups } from './components/common/NotificationPopups';
import { DemoBanner } from './components/common/DemoBanner';
import { DayNightToggle } from './components/common/DayNightToggle';
import { ErrorPopups } from './components/common/ErrorPopups';
import { LicenseGate } from './components/common/LicenseGate';

function AppRoutes() {
  const { loggedInUser, staffList, ready, loginWithCredentials } = useAppContext();

  const handleAdminLogin = () => {
    // Navigate to admin panel directly via hash
    window.location.href = '/admin';
  };

  if (!ready) return null;

  return (
    <>
    <DemoBanner />
    {!loggedInUser && !window.location.pathname.startsWith('/support') && <DayNightToggle className="fixed top-4 left-4 z-50 p-2.5 rounded-2xl bg-white/80 hover:bg-white text-[#6E1B1B] border border-[#EBDBCE] shadow-md" />}
    {loggedInUser && <NotificationPopups />}
    <Routes>
      <Route
        path="/"
        element={
          loggedInUser ? (
            <UserPanel />
          ) : (
            <LoginPage
              staffList={staffList}
              onLogin={async (identifier, password) => {
                const result = await loginWithCredentials(identifier, password);
                return result.ok ? null : result.error;
              }}
              onAdminLogin={handleAdminLogin}
            />
          )
        }
      />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/support" element={<PortalPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export function App() {
  return (
    <LicenseGate>
      <ErrorPopups />
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </LicenseGate>
  );
}

export default App;
