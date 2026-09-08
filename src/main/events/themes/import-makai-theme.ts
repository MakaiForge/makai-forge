import { dialog, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { WindowManager } from '@main/services';
import { themesStore } from '@main/store';
import { themeCache } from '@main/theme/ThemeCache';
import { registerEvent } from '../register-event';
import type { Theme, MakaiThemeV3 } from '@types';

const importMakaiTheme = async (
  _event: Electron.IpcMainInvokeEvent,
  fileArg?: string | ArrayBuffer | Uint8Array
): Promise<Theme | null> => {
  let fileBuffer: Buffer;

  if (typeof fileArg === 'string') {
    fileBuffer = await readFile(fileArg);
  } else if (fileArg) {
    fileBuffer = Buffer.from(fileArg);
  } else {
    const result = await dialog.showOpenDialog(
      (WindowManager.mainWindow as BrowserWindow) ?? undefined,
      {
        title: 'Import Makai Theme',
        filters: [{ name: 'Makai Theme', extensions: ['makaitheme'] }],
        properties: ['openFile'],
      }
    );

    if (result.canceled || result.filePaths.length === 0) return null;
    fileBuffer = await readFile(result.filePaths[0]);
  }

  const zip = await JSZip.loadAsync(fileBuffer);

  const jsonFile = zip.file('theme.json');
  if (!jsonFile) throw new Error('Invalid .makaitheme: theme.json not found');

  const raw = await jsonFile.async('string');
  const data: MakaiThemeV3 = JSON.parse(raw);

  const vars = data.variables || {};
  const SIDEBAR_VAR = '--el-sidebar-bg-image';
  const BG_VAR = '--app-bg-image';

  const filteredVars = Object.fromEntries(
    Object.entries(vars).filter(([key, val]) => {
      if (key === SIDEBAR_VAR) return false;
      if (key === BG_VAR) return false;
      return val && val.trim() !== '';
    })
  );

  const varEntries = Object.entries(filteredVars);

  let generatedCss = ':root {\n';
  for (const [key, value] of varEntries) {
    generatedCss += `  ${key}: ${value};\n`;
  }
  generatedCss += '}\n';

  const cssFile = zip.file('theme.css');
  if (cssFile) {
    let cssContent = await cssFile.async('string');
    const bgDataUriVars = ['--app-bg-image', '--home-bg-image', '--sidebar-bg-image', '--el-sidebar-bg-image'];
    for (const bgVar of bgDataUriVars) {
      const escaped = bgVar.replace(/-/g, '\\-');
      cssContent = cssContent.replace(new RegExp(`^\\s*${escaped}:\\s*url\\(data:[^)]+\\);?\\s*$`, 'gm'), '');
    }
    cssContent = cssContent.replace(/\n{3,}/g, '\n\n').trim();
    generatedCss += `\n${cssContent}`;
  }

  const theme: Theme = {
    id: data.id || randomUUID(),
    name: data.name || 'Imported Theme',
    author: data.author || undefined,
    authorName: undefined,
    isActive: false,
    code: generatedCss,
    vars,
    hasCustomSound: data.hasSound,
    originalSoundPath: undefined,
    background: data.background || null,
    sidebarBackground: data.sidebarBackground || null,
    soundFileName: data.soundFileName || null,
    createdAt: new Date(data.createdAt || Date.now()),
    updatedAt: new Date(data.updatedAt || Date.now()),
  };

  await themeCache.extractZipToCache(zip, theme);
  await themesStore.put(theme.id, theme);

  WindowManager.mainWindow?.webContents.send("on-custom-theme-updated");

  return theme;
};

registerEvent('importMakaiTheme', importMakaiTheme);
