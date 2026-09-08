# Downloads

Gerenciamento de downloads de jogos com visualização de progresso, fila, downloads completos e integração qBittorrent.

## Main Component

- **`Downloads (index.tsx)`** — Duas sub-abas: "Em andamento" (downloads gerenciados pelo app) e "qBittorrent" (webview embutido). Gerencia modais de deleção, remoção, recomendação de Proton, progresso de instalação, scanning e cópia.

## Sub-Components

| Component | File | Role |
|---|---|---|
| `DownloadsContent` | `components/downloads-content.tsx` | Renderiza 3 grupos (downloads ativos, fila, completos) ou estado vazio |
| `DownloadGroup` | `components/download-group.tsx` | Grupo de downloads com hero (ativo), cards (fila/completos) e modal de cancelamento |
| `DownloadAtivo` | `components/download-ativo/` | Hero do download ativo com gráfico de velocidade (speed chart), progresso, ETA, cor dominante |
| `DownloadParado` | `components/download-parado/` | Jogos na fila/pausados com opções de resume/cancel |
| `DownloadConcluido` | `components/download-concluido/` | Downloads completos com ação de instalar/abrir pasta/remover |
| `DownloadCard` | `components/shared/download-card/` | Card genérico de download com progresso e ações |
| `SpeedChart` | `components/shared/speed-chart.tsx` | Gráfico de velocidade ao longo do tempo |
| `AnimatedPercentage` | `components/shared/animated-percentage.tsx` | Porcentagem animada |

### Modals
| Component | File | Role |
|---|---|---|
| `DownloadsModals` | `components/downloads-modals.tsx` | Agrega todos os modais: delete, recomendação, progresso, scanning, cópia, candidatos, sucesso |
| `DeleteGameModal` | `components/delete-game-modal.tsx` | Confirmação de exclusão de jogo |
| `RemoveGameModal` | `components/remove-game-modal.tsx` | Remover da lista (com opção de deletar tudo) |
| `ArchiveDeletionErrorModal` | `components/archive-deletion-error-modal.tsx` | Erro ao deletar arquivo |
| `ExePickerModal` | `components/exe-picker-modal.tsx` | Seletor de executável após instalação |

### Hooks
- **`useDownloadsLayout()`** (`hooks/useDownloadsLayout.ts`) — Classifica library games em 3 grupos (downloading, queued, complete) baseado em status, extração e último pacote
- **`useDownloadsGroup()`** (`hooks/useDownloadsGroup.ts`) — Estado completo de um grupo: hero view, ações, cores dominantes, speed history, ETA, fila, seeding status
- **`useInstallFlow()`** (`@provision/proton_recommended`) — Fluxo de instalação: recomendação → seleção de Proton → progresso

### Utils
- `utils/game-actions.ts` — Ações contextuais por tipo de download
- `utils/color-utils.ts` — Cores para gráficos

## IPC / Backend

- `window.electron.onSeedingStatus` — Status de seeding em tempo real
- `window.electron.onExtractionComplete` — Extração finalizada
- `window.electron.removeGame(shop, objectId)` — Remover jogo
- `window.electron.extractGameDownload(shop, objectId)` — Extrair download
- `window.electron.updateDownloadQueuePosition()` — Reordenar fila
- `window.electron.getGameInstallerActionType()` — Ação pós-instalação

## Routing

- Rota `/downloads`
