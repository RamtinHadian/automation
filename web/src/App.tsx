import React from 'react';
import { Routes, Route, Navigate } from './lib/router';
import { AppProvider } from './context/AppContext';
import { useAppContext } from './context/AppContext';
import UserPanel from './pages/UserPanel';
import AdminPanel from './pages/AdminPanel';
import { LoginPage } from './pages/LoginPage';
import { NotificationPopups } from './components/common/NotificationPopups';
import { DemoBanner } from './components/common/DemoBanner';

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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}

export default App;
