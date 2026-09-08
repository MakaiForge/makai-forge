import fs from 'node:fs/promises';
import path from 'node:path';
import { THEMES_PATH } from '@main/constants';
import type { Theme } from '@types';

export class ThemeCache {
  private getThemeDir(theme: Theme): string {
    const safeName = theme.name
      .toLowerCase()
      .replace(/[^a-z0-9-_\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
    return path.join(THEMES_PATH, safeName || theme.id);
  }

  async exists(theme: Theme): Promise<boolean> {
    try {
      await fs.access(this.getThemeDir(theme));
      return true;
    } catch {
      return false;
    }
  }

  async getSidebarBgPath(theme: Theme): Promise<string | null> {
    const dir = this.getThemeDir(theme);
    if (theme.sidebarBackground?.file) {
      const p = path.join(dir, path.basename(theme.sidebarBackground.file));
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
    const formats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'];
    for (const fmt of formats) {
      const p = path.join(dir, `sidebar-bg.${fmt}`);
      try {
        await fs.access(p);
        return p;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getBackgroundPath(theme: Theme): Promise<string | null> {
    const dir = this.getThemeDir(theme);
    if (theme.background?.file) {
      const p = path.join(dir, path.basename(theme.background.file));
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
    const formats = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm'];
    for (const fmt of formats) {
      const p = path.join(dir, `background.${fmt}`);
      try {
        await fs.access(p);
        return p;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getSoundPath(theme: Theme): Promise<string | null> {
    const dir = this.getThemeDir(theme);
    const formats = ['mp3', 'wav', 'ogg', 'm4a'];
    for (const fmt of formats) {
      const p = path.join(dir, `sound.${fmt}`);
      try {
        await fs.access(p);
        return p;
      } catch {
        continue;
      }
    }
    if (theme.soundFileName) {
      const p = path.join(dir, theme.soundFileName);
      try {
        await fs.access(p);
        return p;
      } catch {
        return null;
      }
    }
    return null;
  }

  async getScreenshotPath(theme: Theme): Promise<string | null> {
    const dir = this.getThemeDir(theme);
    const p = path.join(dir, 'screenshot.webp');
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }

  async extractZipToCache(
    zip: any,
    theme: Theme
  ): Promise<{ background?: string; sidebarBg?: string; sound?: string; screenshot?: string }> {
    const dir = this.getThemeDir(theme);
    // Clean old files before extract
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(dir, { recursive: true });

    const result: { background?: string; sidebarBg?: string; sound?: string; screenshot?: string } = {};

    const entries = Object.keys(zip.files);
    for (const entryName of entries) {
      const entry = zip.files[entryName];
      if (entry.dir) continue;

      const buffer = Buffer.from(await entry.async('arraybuffer'));
      const filePath = path.join(dir, path.basename(entryName));
      await fs.writeFile(filePath, buffer);

      const lower = entryName.toLowerCase();
      if (lower.startsWith('background.')) {
        result.background = filePath;
      } else if (lower.startsWith('sidebar-bg.')) {
        result.sidebarBg = filePath;
      } else if (lower === 'screenshot.webp') {
        result.screenshot = filePath;
      } else if (
        lower.startsWith('sound.') ||
        (theme.soundFileName && entryName === theme.soundFileName)
      ) {
        result.sound = filePath;
      }
    }

    return result;
  }

  async removeFromCache(theme: Theme): Promise<void> {
    const dir = this.getThemeDir(theme);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const themeCache = new ThemeCache();
