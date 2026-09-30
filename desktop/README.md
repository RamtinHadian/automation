# Windows desktop app

Electron shell that opens the automation app in its own window: always on top of other windows (optional), small corner window mode, opacity, tray icon, start with Windows, native notifications with sound (also while the window is closed to the tray).

Build (on a Windows PC with Node):

```
cd desktop
npm install
npm run pack        # -> dist/AutomationDesktop-win32-x64/AutomationDesktop.exe
```

Zip that folder and copy it to the users' PCs; no installation needed, just run `AutomationDesktop.exe`.
The server address defaults to `http://5.202.174.91:9090` and can be changed inside the app (monitor icon in the header) or from the tray menu.
