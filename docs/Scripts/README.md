# Scripts

Página standalone de instalação de script da comunidade, acessada via deep link. Similar ao `InstallScriptModal` porém em página própria.

## Main Component

- **`InstallScript (install-script.tsx)`** — Página full-screen para instalação de script via `scriptId` do URL. Exibe informações (título, autor, versão, descrição, distro, status), tags, dicas de instalação, badge de Proton definido no script, barra de progresso, preview do conteúdo e botão de instalação.

## Key Behavior

- **Auto-install**: Aguarda 800ms e inicia instalação automaticamente (para deep links)
- **Progresso**: Status textuais (proton, download, installing, complete, error) com detalhes
- **Pós-instalação**: Se o Proton já foi definido no script, pula o seletor
- **Fallback**: Se não há candidatos, abre file picker para selecionar executável

## IPC / Backend

- `window.electron.getScriptById(scriptId)` — Dados do script
- `window.electron.installScript(scriptId)` — Executa instalação
- `window.electron.onInstallProgress()` — Progresso da instalação
- `window.electron.setGameExecutablePath()` — Configura executável
- `window.electron.openExeFilePicker()` — Seletor de arquivo

## States

| State | Behavior |
|---|---|
| `loading` | Tela centralizada "Carregando script..." |
| `error` | Mensagem + botão "Voltar ao início" |
| `ready` | Card com info + preview + botão "Instalar" |
| `installing` | Status + detalhes + progresso + botão desabilitado |
| `candidates` | `ExecutableCandidateModal` para escolher exe |
| `complete` | Navega para `/game/:shop/:objectId` |

## Routing

- Rota `/scripts/:scriptId` (deep link)
- Navega para `/game/:shop/:objectId` após sucesso
- Botão "Voltar" usa `navigate(-1)`
