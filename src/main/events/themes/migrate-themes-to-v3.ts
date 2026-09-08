import { registerEvent } from '../register-event';
import { themesStore } from '@main/store';
import type { Theme } from '@types';

const migrateThemesToV3 = async (_event: Electron.IpcMainInvokeEvent): Promise<void> => {
  const themes = await themesStore.values().all() as Theme[];

  for (const theme of themes) {
    if (theme.version === 3) continue;

    const updated: Theme = {
      ...theme,
      format: 'makaitheme',
      version: 3,
      background: theme.background || { type: 'none' },
      soundFileName: theme.soundFileName || undefined,
    };

    await themesStore.put(theme.id, updated);
  }
};

registerEvent('migrateThemesToV3', migrateThemesToV3);
