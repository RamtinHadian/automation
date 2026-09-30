import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from './lib/router';
import App from './App';
import 'vazirmatn/Vazirmatn-Variable-font-face.css'; // the font is bundled with the app (no dependency on Google Fonts)
import './index.css';
import { installPersianDigits } from './lib/persianDigits';

installPersianDigits();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
