# Emulators

Página de emuladores instalados, organizados por categoria (Nintendo, Sony, Sega, Arcade, etc.) com cards, ROM sites e webview preview.

## Main Component

- **`emulators.tsx`** — Lista emuladores instalados em grid, categorizados. Cada card exibe ícone, nome, plataformas, versão, botão play/stop e seção expansível de ROM sites com webview preview.

## Sub-Components

| Item | Role |
|---|---|
| Card com ícone | Ícone do emulador (data URL) ou placeholder com inicial |
| Play/Stop button | Botão toggle para iniciar ou parar emulador |
| ROM sites toggle | Expande lista de sites de ROMs com preview em webview |
| Botão adicionar site | Prompt para adicionar site personalizado (armazenado em localStorage) |

## Hooks

- **`useRunners()`** (`@hooks/use-runners`) — Lista de emuladores instalados, seus ícones e status

## IPC / Backend

- `window.electron.getRunners()` — Lista todos os emuladores disponíveis
- `window.electron.showOpenDialog()` — Seletor de arquivo ROM
- `window.electron.launchGame(runnerId, romPath)` — Iniciar emulador com ROM
- `window.electron.closeRunner(runnerId)` — Parar emulador
- `window.electron.onGamesRunning()` — Callback de jogos rodando
- `window.electron.openExternal(url)` — Abrir site externo

## Storage

- Sites de ROM adicionados pelo usuário salvos em `localStorage` (`emulator-extra-sites`)
- Categorias: Nintendo, Sony, Sega, Arcade, Computadores, Microsoft, Multiplataforma, Obscuro

## Routing

- Rota `/emulators`
- Card vazio redireciona para `/settings?tab=runners`
