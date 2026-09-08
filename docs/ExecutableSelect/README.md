# ExecutableSelect

Página de seleção de executável do jogo após instalação, exibindo candidatos encontrados no prefixo Wine e permitindo escolha manual.

## Main Component

- **`executable-select.tsx`** — Exibe lista de executáveis candidatos (nome, tamanho, caminho relativo) encontrados no prefixo Wine, ou permite buscar manualmente. Após confirmação, mostra tela de sucesso com link para a biblioteca.

## States

| State | Behavior |
|---|---|
| `loading` | Texto "Carregando..." |
| `error` | Mensagem de erro + botão fechar (chama `cancelExecutableSelection()`) |
| `success` | Ícone de check + "Jogo instalado com sucesso!" + botão "Ir para Games" |
| `no candidates` | Mensagem para buscar manualmente com "Procurar" |
| `candidates available` | Lista clicável de executáveis com ícone, nome, caminho relativo e tamanho |

## IPC / Backend

- `window.electron.getPendingExecutableSelection()` — Dados da seleção pendente (candidates, prefixDriveCPath, gameTitle, shop, objectId)
- `window.electron.confirmExecutableSelection(shop, objectId, path)` — Salva caminho do executável
- `window.electron.cancelExecutableSelection()` — Cancela e fecha
- `window.electron.showOpenDialog()` — Seletor de arquivo (.exe, .lnk)
- `window.electron.getDefaultDownloadsPath()` — Caminho padrão de downloads

## Routing

- Página standalone (rota própria), aberta via `BrowserWindow` separado
- Ao confirmar, navega para `/game/:shop/:objectId`
- Ao cancelar, fecha a janela
