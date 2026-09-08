import { registerEvent } from '../register-event';
import { themeCache } from '@main/theme/ThemeCache';
import { themesStore } from '@main/store';

const getThemeAssetPath = async (
  _event: Electron.IpcMainInvokeEvent,
  themeId: string,
  assetType: 'background' | 'sidebarBg' | 'sound' | 'screenshot'
): Promise<string | null> => {
  try {
    const theme = await themesStore.get(themeId);
    if (!theme) return null;

    switch (assetType) {
      case 'background':
        return themeCache.getBackgroundPath(theme);
      case 'sidebarBg':
        return themeCache.getSidebarBgPath(theme);
      case 'sound':
        return themeCache.getSoundPath(theme);
      case 'screenshot':
        return themeCache.getScreenshotPath(theme);
      default:
        return null;
    }
  } catch {
    return null;
  }
};

registerEvent('getThemeAssetPath', getThemeAssetPath);
