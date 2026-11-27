import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from './lib/router';
import App from './App';
import 'vazirmatn/Vazirmatn-Variable-font-face.css'; // the font is bundled with the app (no dependency on Google Fonts)
import './fa-digits.css'; // Latin digits shown with Persian shapes everywhere
import './index.css';
import { installPersianDigits } from './lib/persianDigits';
import { installEnterKey } from './lib/enterKey';
import { installPublicIp } from './lib/publicIp';
import { applyDirectPrintParams } from './lib/directPrint';

installPersianDigits();
installEnterKey();
installPublicIp();
applyDirectPrintParams(); // the desktop icon of «چاپ مستقیم» opens the site with the printer's paper in the address

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
