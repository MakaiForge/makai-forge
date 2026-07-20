import { useEffect } from 'react';
import { useTheme } from '../../theme/ThemeProvider';

export function useSidebarTheme() {
  const { themeState } = useTheme();
  const activeTheme = themeState.activeTheme;

  useEffect(() => {
    if (!activeTheme) {
      document.documentElement.style.removeProperty('--el-sidebar-bg-image');
      return;
    }

    let cancelled = false;

    window.electron.getThemeAssetPath(activeTheme.id, 'sidebarBg').then((sidebarBgPath) => {
      if (cancelled) return;
      if (sidebarBgPath) {
        document.documentElement.style.setProperty(
          '--el-sidebar-bg-image',
          `url("local:${sidebarBgPath}")`
        );
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
      document.documentElement.style.removeProperty('--el-sidebar-bg-image');
    };
  }, [activeTheme]);
}
