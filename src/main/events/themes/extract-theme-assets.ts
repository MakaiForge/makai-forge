import JSZip from 'jszip';
import { WindowManager } from '@main/services';
import { themeCache } from '@main/theme/ThemeCache';
import { registerEvent } from '../register-event';
import type { Theme } from '@types';

const extractThemeAssets = async (
  _event: Electron.IpcMainInvokeEvent,
  fileBuffer: ArrayBuffer | Uint8Array,
  theme: Theme
) => {
  const zip = await JSZip.loadAsync(Buffer.from(fileBuffer));

  const result = await themeCache.extractZipToCache(zip, theme);

  WindowManager.mainWindow?.webContents.send("on-custom-theme-updated");

  return result;
};

registerEvent("extractThemeAssets", extractThemeAssets);
