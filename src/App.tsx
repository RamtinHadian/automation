import React from 'react';
import { Routes, Route, Navigate } from './lib/router';
import { AppProvider } from './context/AppContext';
import UserPanel from './pages/UserPanel';
import AdminPanel from './pages/AdminPanel';

export function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<UserPanel />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  );
}

export default App;
