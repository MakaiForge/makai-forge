# SharedModals

Modais compartilhados utilizados em diferentes partes do aplicativo.

## Modals

### InstallScriptModal (`install-script-modal.tsx`)

Modal de instalação de script da comunidade. Exibe informações do script (título, autor, versão, descrição, tags), sistema de votos (like/dislike), seção de comentários, preview do script, progresso da instalação com barra e status textuais, logs em tempo real e overlay de erro com opções de copiar log e reportar bug.

**Fluxo**: Info → Instalar → Progresso (download, extração, prefixo, DLLs, instalação, cópia) → Completado ou erro.

**Estados**: `info` (exibe detalhes), `installing` (progresso + logs), `proton_pick` / `candidates` (pós-instalação).

**IPC**: `electron.getScriptById()`, `electron.installScript()`, `electron.getScriptComments()`, `electron.toggleScriptLike/dislike()`, `electron.postScriptComment()`, `electron.deleteScriptComment()`, `electron.onInstallProgress()`, `electron.onInstallLog()`, `electron.openExeFilePicker()`, `electron.setGameExecutablePath()`, `electron.getMe()`

### BinaryNotFoundModal (`binary-not-found-modal.tsx`)

Modal simples informando que um binário não foi encontrado, com opção de procurar manualmente.

**Props**: `visible`, `onClose`, `onBrowse?`

### ProtonForgeCloudModal (`protonforge-cloud/protonforge-cloud-modal.tsx`)

Modal promocional do ProtonForge Cloud, exibido quando uma funcionalidade requer o serviço cloud.

**Props**: `visible`, `onClose`, `feature` (identificador da feature)

**IPC**: `window.electron.openCheckout()` — Abre página de checkout

## Reused Components

- `Modal` (`@components/modal`)
- `ExecutableCandidateModal` (`@provision/ForgePipeline/ui/executable-candidate-modal`)
- `Button` (`@components/button`)

## Routing

- `InstallScriptModal` é um modal (não uma rota), controlado por `visible`/`onClose`
- Pode abrir a rota `/game/:shop/:objectId` após instalação bem-sucedida
