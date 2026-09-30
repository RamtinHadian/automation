// Bridge to the Windows desktop shell (Electron). Undefined in a normal browser.
export interface DesktopSettings {
  serverUrl: string;
  alwaysOnTop: boolean;
  isAlwaysOnTop?: boolean;
  mode: 'normal' | 'compact';
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  autoStart: boolean;
  closeToTray: boolean;
}

export interface DesktopBridge {
  isDesktop: true;
  getSettings: () => Promise<DesktopSettings>;
  setSettings: (patch: Partial<DesktopSettings>) => Promise<DesktopSettings>;
  notify: (n: unknown) => void;
  focus: () => void;
  onSettings: (cb: (s: DesktopSettings) => void) => () => void;
  onOpenNotification: (cb: (n: unknown) => void) => () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export const getDesktop = () => (typeof window !== 'undefined' ? window.desktop : undefined);
