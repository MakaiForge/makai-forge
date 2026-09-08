# FolderSelect

Página de seleção de arquivos/pastas para copiar para o prefixo Wine, usada durante instalação de jogos que requerem arquivos adicionais.

## Main Component

- **`folder-select.tsx`** — Exibe lista de itens (pastas pré-selecionadas + arquivos) com checkboxes, ferramentas de selecionar/desmarcar todos, contador de selecionados. Mostra estado de carregamento, erro ou sucesso.

## States

| State | Behavior |
|---|---|
| `loading` | Texto "Carregando..." |
| `error` | Mensagem + botão fechar (chama `cancelFileSelection()`) |
| `success` | "Arquivos copiados com sucesso!" + botão fechar |
| `items available` | Lista com checkboxes, toolbar (select all / deselect all), contagem |

## IPC / Backend

- `window.electron.getPendingFileSelection()` — Itens disponíveis (nome, path, isDirectory, size), folderPath, shop, objectId
- `window.electron.confirmFileSelection(shop, objectId, selectedPaths)` — Copia arquivos selecionados
- `window.electron.cancelFileSelection()` — Cancela e fecha

## Key Behavior

- Pastas (directories) são **pré-selecionadas** por padrão
- Arquivos vêm **sem seleção** inicial
- Tamanho dos arquivos exibido em formato legível (B, KB, MB)
- Ícones diferentes para pastas (`FileDirectoryIcon`) e arquivos (`FileIcon`)

## Routing

- Página standalone, aberta via `BrowserWindow` separado
- Ao confirmar, copia selecionados e fecha
