const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen, nativeImage, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_SERVER = 'http://5.202.174.91:9090';
const DEFAULTS = {
  serverUrl: DEFAULT_SERVER,
  alwaysOnTop: false,
  mode: 'normal', // 'normal' | 'compact' (small window docked in a corner)
  corner: 'bottom-right', // top-left | top-right | bottom-left | bottom-right
  opacity: 1,
  autoStart: false,
  closeToTray: true,
  bounds: null,
};
const COMPACT = { width: 420, height: 780 };

const settingsFile = () => path.join(app.getPath('userData'), 'desktop-settings.json');
let settings = { ...DEFAULTS };
let win = null;
let tray = null;
let quitting = false;

function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    settings = { ...DEFAULTS };
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('could not save settings', e);
  }
}

const icon = () => nativeImage.createFromPath(path.join(__dirname, 'icon.png'));

function cornerPosition(width, height, corner) {
  const wa = screen.getDisplayMatching(win ? win.getBounds() : screen.getPrimaryDisplay().bounds).workArea;
  const margin = 12;
  const x = corner.endsWith('left') ? wa.x + margin : wa.x + wa.width - width - margin;
  const y = corner.startsWith('top') ? wa.y + margin : wa.y + wa.height - height - margin;
  return { x, y };
}

let normalBounds = null;

/** Applies every display option to the window. */
function apply() {
  if (!win) return;
  // 'screen-saver' level keeps the window above other windows, taskbar and most full-screen programs.
  win.setAlwaysOnTop(!!settings.alwaysOnTop, 'screen-saver');
  win.setOpacity(Math.min(1, Math.max(0.3, Number(settings.opacity) || 1)));
  app.setLoginItemSettings({ openAtLogin: !!settings.autoStart });

  if (settings.mode === 'compact') {
    if (!win.__compact) {
      normalBounds = win.getBounds();
      win.__compact = true;
    }
    const pos = cornerPosition(COMPACT.width, COMPACT.height, settings.corner);
    win.setResizable(true);
    win.setMinimumSize(340, 480);
    win.setBounds({ ...pos, ...COMPACT });
  } else if (win.__compact) {
    win.__compact = false;
    win.setMinimumSize(360, 520);
    if (normalBounds) win.setBounds(normalBounds);
  }
  buildTray();
  win.webContents.send('desktop:settings', publicSettings());
}

const publicSettings = () => ({ ...settings, isAlwaysOnTop: win ? win.isAlwaysOnTop() : false });

function update(patch) {
  settings = { ...settings, ...patch };
  saveSettings();
  if (patch.serverUrl !== undefined) loadApp();
  apply();
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildTray() {
  if (!tray) {
    tray = new Tray(icon().resize({ width: 16, height: 16 }));
    tray.setToolTip('اتوماسیون اداری');
    tray.on('click', showWindow);
  }
  const corners = [
    ['top-right', 'بالا راست'],
    ['top-left', 'بالا چپ'],
    ['bottom-right', 'پایین راست'],
    ['bottom-left', 'پایین چپ'],
  ];
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'نمایش برنامه', click: showWindow },
      { type: 'separator' },
      {
        label: 'همیشه روی همهٔ پنجره‌ها',
        type: 'checkbox',
        checked: !!settings.alwaysOnTop,
        click: (i) => update({ alwaysOnTop: i.checked }),
      },
      {
        label: 'نحوهٔ نمایش',
        submenu: [
          { label: 'پنجرهٔ عادی', type: 'radio', checked: settings.mode === 'normal', click: () => update({ mode: 'normal' }) },
          { label: 'پنجرهٔ کوچک در گوشهٔ صفحه', type: 'radio', checked: settings.mode === 'compact', click: () => update({ mode: 'compact' }) },
        ],
      },
      {
        label: 'گوشهٔ پنجرهٔ کوچک',
        submenu: corners.map(([id, label]) => ({
          label,
          type: 'radio',
          checked: settings.corner === id,
          click: () => update({ corner: id, mode: 'compact' }),
        })),
      },
      {
        label: 'شفافیت',
        submenu: [1, 0.9, 0.8, 0.7, 0.6, 0.5].map((o) => ({
          label: `${Math.round(o * 100)}٪`,
          type: 'radio',
          checked: Math.abs(settings.opacity - o) < 0.01,
          click: () => update({ opacity: o }),
        })),
      },
      { type: 'separator' },
      { label: 'اجرا همراه با ویندوز', type: 'checkbox', checked: !!settings.autoStart, click: (i) => update({ autoStart: i.checked }) },
      { label: 'با بستن، در نوار وظیفه بماند', type: 'checkbox', checked: !!settings.closeToTray, click: (i) => update({ closeToTray: i.checked }) },
      { type: 'separator' },
      { label: 'خروج کامل', click: () => { quitting = true; app.quit(); } },
    ])
  );
}

const offlinePage = (url) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><body style="font-family:Tahoma,sans-serif;background:#FAF5F1;color:#3A241F;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
<div><div style="font-size:42px">☁️</div><h2>اتصال به سرور برقرار نشد</h2><p style="color:#8C6F66">آدرس: <span dir="ltr">${url}</span></p><p style="color:#8C6F66">هر چند ثانیه دوباره تلاش می‌شود.<br>آدرس سرور را از منوی نوار وظیفه یا داخل برنامه می‌توانید تغییر دهید.</p></div>
<script>setTimeout(()=>location.href=${JSON.stringify(url)},5000)</script></body></html>`);

function loadApp() {
  if (!win) return;
  win.loadURL(settings.serverUrl).catch(() => {});
}

function createWindow() {
  const b = settings.bounds || { width: 1280, height: 860 };
  win = new BrowserWindow({
    ...b,
    minWidth: 360,
    minHeight: 520,
    title: 'اتوماسیون اداری',
    icon: icon(),
    backgroundColor: '#FAF5F1',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep sounds and the live notification stream working when the window is hidden or minimised.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.removeMenu();

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (isMain && code !== -3) win.loadURL(offlinePage(settings.serverUrl));
  });
  win.on('resize', () => {
    if (!win.__compact && !win.isMaximized() && !win.isMinimized()) settings.bounds = win.getBounds();
  });
  win.on('move', () => {
    if (!win.__compact && !win.isMaximized() && !win.isMinimized()) settings.bounds = win.getBounds();
  });
  win.on('close', (e) => {
    saveSettings();
    if (!quitting && settings.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
  win.webContents.on('did-finish-load', () => win && win.webContents.send('desktop:settings', publicSettings()));

  loadApp();
  apply();
}

// ---------- IPC from the web app ----------
ipcMain.handle('desktop:get', () => publicSettings());
ipcMain.handle('desktop:set', (_e, patch) => {
  const allowed = ['alwaysOnTop', 'mode', 'corner', 'opacity', 'autoStart', 'closeToTray', 'serverUrl'];
  const clean = {};
  for (const k of allowed) if (patch && k in patch) clean[k] = patch[k];
  if (clean.serverUrl && !/^https?:\/\//i.test(clean.serverUrl)) delete clean.serverUrl;
  update(clean);
  return publicSettings();
});
// ---------- notification pop-ups: small always-on-top windows in the corner of the screen ----------
// They appear above every other program (even when the app window is minimised or hidden in the tray).
const POP_W = 400;
const POP_H = 138;
const POP_GAP = 4;
const POP_SHOW_MS = 9000;
const MAX_POPUPS = 4;
const popups = []; // newest first: { win, n, timer, left, startedAt }

function layoutPopups() {
  const wa = screen.getPrimaryDisplay().workArea;
  let y = wa.y + wa.height - 8;
  for (const p of popups) {
    y -= POP_H;
    if (!p.win.isDestroyed()) p.win.setBounds({ x: wa.x + wa.width - POP_W - 4, y, width: POP_W, height: POP_H });
    y -= POP_GAP;
  }
}

function closePopup(p) {
  clearTimeout(p.timer);
  const i = popups.indexOf(p);
  if (i >= 0) popups.splice(i, 1);
  if (!p.win.isDestroyed()) p.win.destroy();
  layoutPopups();
}

function armPopup(p) {
  clearTimeout(p.timer);
  p.startedAt = Date.now();
  p.timer = setTimeout(() => closePopup(p), p.left);
}

function showPopup(n) {
  while (popups.length >= MAX_POPUPS) closePopup(popups[popups.length - 1]);
  const pw = new BrowserWindow({
    width: POP_W,
    height: POP_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'popup-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  pw.setAlwaysOnTop(true, 'screen-saver');
  const p = { win: pw, n, timer: null, left: POP_SHOW_MS, startedAt: Date.now() };
  popups.unshift(p);
  layoutPopups();
  pw.webContents.once('did-finish-load', () => {
    if (pw.isDestroyed()) return;
    pw.webContents.send('popup:data', n);
    pw.showInactive();
    armPopup(p);
  });
  pw.loadFile(path.join(__dirname, 'popup.html'));
}

const popupOf = (e) => popups.find((x) => !x.win.isDestroyed() && x.win.webContents === e.sender);
ipcMain.on('popup:open', (e) => {
  const p = popupOf(e);
  if (!p) return;
  const n = p.n;
  closePopup(p);
  showWindow();
  if (win) win.webContents.send('desktop:open-notification', n);
});
ipcMain.on('popup:close', (e) => {
  const p = popupOf(e);
  if (p) closePopup(p);
});
ipcMain.on('popup:hover', (e, on) => {
  const p = popupOf(e);
  if (!p) return;
  if (on) {
    clearTimeout(p.timer);
    p.left = Math.max(2000, p.left - (Date.now() - p.startedAt));
  } else {
    armPopup(p);
  }
});

ipcMain.on('desktop:notify', (_e, n) => {
  if (!n || !n.title) return;
  showPopup({ kind: n.kind, label: n.label, title: String(n.title), body: String(n.body || ''), id: n.id, ref: n.ref || null, userId: n.userId, createdAt: n.createdAt });
});
ipcMain.on('desktop:focus', () => showWindow());

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
    saveSettings();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('ir.pyladani.automation');
    loadSettings();
    // The app is loaded from the company server: allow notifications and clipboard etc. for it only.
    require('electron').session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
      cb(['notifications', 'media', 'clipboard-sanitized-write', 'fullscreen'].includes(permission))
    );
    createWindow();
    if (process.env.AUTOMATION_DEBUG_PORT) console.log('debug ready');
  });
  app.on('activate', showWindow);
  app.on('window-all-closed', () => {
    if (quitting) app.quit();
  });
}
