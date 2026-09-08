# EmulatorDetail

Página de detalhes de um emulador específico, com hero image, informações, botão play, galeria de screenshots e sites de ROMs.

## Main Component

- **`emulator-detail.tsx`** — Página de detalhes com hero section (screenshot slideshow, ícone, nome, plataformas, versão, play button), descrição e grid de sites de ROMs com preview.

## Sub-Components

| Component | File | Role |
|---|---|---|
| `PlayButton` | `components/play-button.tsx` | Botão play/stop com spinner de loading |
| `SitePreview` | `components/site-preview.tsx` | Card de preview de site de ROM (nome, imagem, botão abrir) |
| `ScreenshotSlideshow` | `components/screenshot-slideshow.tsx` | Slideshow automático de screenshots da plataforma |
| `AddSiteModal` | `components/add-site-modal.tsx` | Modal para adicionar site de ROM personalizado |
| `SitesTabs` | `components/sites-tabs.tsx` | Abas de navegação entre sites |

## Hooks

| Hook | File | Role |
|---|---|---|
| `useEmulator(runnerId)` | `hooks/use-emulator.ts` | Carrega dados do emulador, status e ícone via IPC |
| `useRunnerProcess(runnerId)` | `hooks/use-runner-process.ts` | Controla play/stop, seleção de ROM, preferências de lançamento (GUI vs ROM direto) |
| `useExtraSites(runnerId)` | `hooks/use-extra-sites.ts` | Gerencia sites de ROM personalizados em localStorage |
| `useScreenshots(platformSlug)` | `hooks/use-screenshots.ts` | Screenshots da plataforma via API |

## IPC / Backend

- `window.electron.getRunners()` — Lista de emuladores
- `window.electron.getRunnerStatus(runnerId)` — Status de instalação
- `window.electron.getRunnerIcon(runnerId)` — Ícone do emulador
- `window.electron.launchGame(runnerId, romPath)` — Iniciar emulador
- `window.electron.closeRunner(runnerId)` — Parar emulador
- `window.electron.showOpenDialog()` — Seletor de arquivo ROM

## Storage

- Preferências de lançamento em `localStorage` (`runner-preferences`)
- Sites extras em `localStorage` (`emulator-extra-sites`)

## Routing

- Rota `/emulators/:runnerId`
- Botão "Voltar" navega para `/emulators`
