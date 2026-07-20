import { useEffect, createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { injectCustomCss, removeCustomCss, applyThemeVars, removeThemeVars } from '../helpers';
import { storeService } from '@shared-services/store.service';
import { ThemeBackground } from './ThemeBackground';
import type { Theme } from '@types';

interface ThemeState {
  activeTheme: Theme | null;
  backgroundAssetPath: string | null;
  isLoading: boolean;
}

interface ThemeContextValue {
  themeState: ThemeState;
  refreshTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeState, setThemeState] = useState<ThemeState>({
    activeTheme: null,
    backgroundAssetPath: null,
    isLoading: true,
  });

  const loadAndApplyTheme = useCallback(async () => {
    setThemeState(prev => ({ ...prev, isLoading: true }));
    await window.electron.migrateThemesToV3().catch(() => {});
    const allThemes = (await storeService.values('themes')) as Theme[];
    const active = allThemes.find((t) => t.isActive) || null;

    console.log('[ThemeProvider] total themes:', allThemes.length, 'active:', active?.name || 'none');

    removeThemeVars();
    removeCustomCss();

    if (active) {
      console.log('[ThemeProvider] applying theme:', active.name, 'vars:', Object.keys(active.vars || {}).length);
      if (active.vars) {
        applyThemeVars(active.vars);
        console.log('[ThemeProvider] vars applied:', Object.keys(active.vars).length);
      }
      injectCustomCss(active.code);
      console.log('[ThemeProvider] custom CSS injected, length:', active.code.length);

      // Sempre adiciona wallpaper-active para que o efeito vidro funcione,
      // mesmo em temas sem background image.
      document.documentElement.classList.add('wallpaper-active');

      let bgPath: string | null = null;
      if (active.background && active.background.type !== 'none') {
        console.log('[ThemeProvider] background type:', active.background.type);
        bgPath = await window.electron.getThemeAssetPath(active.id, 'background').catch(() => null);
        console.log('[ThemeProvider] background path:', bgPath);
      } else {
        console.log('[ThemeProvider] no background (type:', active.background?.type || 'undefined', ')');
      }

      setThemeState({ 
        activeTheme: active, 
        backgroundAssetPath: bgPath,
        isLoading: false,
      });
    } else {
      document.documentElement.classList.remove('wallpaper-active');
      console.log('[ThemeProvider] no active theme, clearing');
      setThemeState({ 
        activeTheme: null, 
        backgroundAssetPath: null,
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    loadAndApplyTheme();
  }, [loadAndApplyTheme]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = window.electron.onCustomThemeUpdated(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadAndApplyTheme();
        timer = null;
      }, 50);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [loadAndApplyTheme]);

  return (
    <ThemeContext.Provider value={{ themeState, refreshTheme: loadAndApplyTheme }}>
      <ThemeBackground
        config={themeState.activeTheme?.background || null}
        assetPath={themeState.backgroundAssetPath}
      />
      {children}
    </ThemeContext.Provider>
  );
}
