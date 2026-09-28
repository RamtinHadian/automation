import React from 'react';
import { Routes, Route, Navigate } from './lib/router';
import { AppProvider } from './context/AppContext';
import { useAppContext } from './context/AppContext';
import UserPanel from './pages/UserPanel';
import AdminPanel from './pages/AdminPanel';
import { LoginPage } from './pages/LoginPage';

function AppRoutes() {
  const { loggedInUser, staffList, login } = useAppContext();

  const handleAdminLogin = () => {
    // Navigate to admin panel directly via hash
    window.location.hash = '#/admin';
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          loggedInUser ? (
            <UserPanel />
          ) : (
            <LoginPage
              staffList={staffList}
              onLogin={login}
              onAdminLogin={handleAdminLogin}
            />
          )
        }
      />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
