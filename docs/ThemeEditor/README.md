# Theme Editor

Editor de temas customizados com CSS. Documentado em [`Games/theme-editor.md`](../Games/theme-editor.md).

## Arquivos

| Arquivo | Função |
|---------|--------|
| `ThemeBackground.tsx` | Background dinâmico do tema |
| `ThemeEditor.tsx` | Editor de temas (cores, glass, wallpaper) |
| `ThemeImporter.tsx` | Importador de temas de terceiros |

## Integração

- Usa `_shared/context/SettingsContext` para persistir tema
- Usa `_styles/theme/` tokens para variáveis CSS
- Tema é aplicado via `ThemeProvider` em `app.tsx`
