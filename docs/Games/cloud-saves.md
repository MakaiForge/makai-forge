# Cloud Saves

> Sistema de backup e sincronização de saves na nuvem. Integra **Ludusavi** (backup local) com a **API remota do ProtonForge** (storage na nuvem).

---

## Mapa Mental

```
CLOUD SAVES
│
├── LOCAL (Ludusavi)
│   ├── Scan de saves no Wine prefix
│   ├── Backup → .tar
│   └── Preview (simulação)
│
├── NUVEM (forgerApi)
│   ├── Upload do .tar
│   ├── Listar artifacts
│   ├── Download/Restore (STUB)
│   └── Renomear/Congelar/Deletar
│
├── AUTOMÁTICO (process-watcher)
│   └── Upload quando jogo fecha
│
└── MANUAL (UI)
    └── Botão "Create Backup" no painel
```

---

## Arquitetura

```
Renderer (CloudSyncPanel)
  │
  ├── window.electron.uploadSaveGame()
  ├── window.electron.downloadGameArtifact()
  ├── window.electron.getGameArtifacts()
  ├── window.electron.getGameBackupPreview()
  ├── window.electron.selectGameBackupPath()
  └── window.electron.toggleAutomaticCloudSync()
        │
        ▼  [IPC invoke]
Main Process
  │
  ├── cloud-sync.ts :: CloudSync
  │     ├── uploadSaveGame()
│   │     ├── Verifica subscription (armazenamento)
  │     │     ├── Ludusavi.backupGame() → backup local
  │     │     ├── tar.create() → empacota
  │     │     └── Envia evento on-upload-complete
  │     │
  │     └── bundleBackup()
  │           └── Ludusavi → tar
  │
  ├── ludusavi.ts :: Ludusavi
  │     ├── backupGame() → spawn ludusavi backup
  │     ├── getBackupPreview() → spawn ludusavi --preview
  │     └── addCustomGame() → edita config.yaml
  │
  ├── process-watcher.ts
  │     └── automaticCloudSync → upload na saída do jogo
  │
  └── Armazenamento
        ├── user → subscription check
        └── games → automaticCloudSync flag
              │
              ▼
Remoto (forgerApi HTTP)
  ├── GET  /profile/games/artifacts → listar
  ├── PUT  /profile/games/artifacts/:id → renomear
  ├── DELETE /profile/games/artifacts/:id → deletar
  ├── PUT  /profile/games/artifacts/:id/freeze → congelar
  └── PUT  /profile/games/artifacts/:id/unfreeze → descongelar
```

---

## Fluxo de Execução Detalhado

### 1. Upload Manual

```
Usuário clica "Create Backup" no CloudSyncPanel
       │
       ▼
cloud-sync.context.tsx :: uploadSaveGame(downloadOptionTitle)
       │
       ▼  IPC invoke
src/main/events/cloud-save/upload-save-game.ts :: "uploadSaveGame"
       │
       ▼  chama
src/main/services/cloud-sync.ts :: CloudSync.uploadSaveGame()
       │
       ├── 1. VERIFICA SUBSCRIPTION
       │     └── db.get(storeKeys.user) → subscription.expiresAt
       │         └── Se expirado → throw SubscriptionRequiredError
       │
       ├── 2. CARREGA JOGO
       │     └── gamesStore.get(storeKeys.game(shop, objectId))
       │
       ├── 3. RESOLVE WINE PREFIX
       │     └── Wine.getEffectivePrefixPath(game.winePrefixPath, objectId)
       │
       ├── 4. BUNDLE BACKUP (local)
       │     └── this.bundleBackup(shop, objectId, winePrefixPath)
       │           ├── Remove backup anterior: backupsPath/{shop}-{objectId}/
       │           ├── Ludusavi.backupGame(objectId, backupPath, winePrefix)
       │           │     └── spawn: ludusavi backup <id> --api --force --path <path> --wine-prefix <pfx>
       │           ├── tar.create() → backupsPath/{randomUUID}.tar
       │           └── Remove diretório do Ludusavi
       │
       ├── 5. ENVIA EVENTO DE COMPLETO
       │     └── webContents.send("on-upload-complete-{objectId}-{shop}")
       │
       └── 6. LIMPA .tar TEMPORÁRIO
             └── fs.unlinkSync(tarPath)

Renderer recebe evento
       │
       ▼
       Toast "backup_uploaded"
       → Refresha artifacts list
       → Refresha backup preview
```

### 2. Upload Automático

```
process-watcher.ts :: onGameClose()
       │
       ├── Se game.automaticCloudSync === true:
       │     └── CloudSync.uploadSaveGame(objectId, shop, null, label)
       │           └── Mesmo fluxo do manual, mas:
       │               ├── downloadOptionTitle = null
       │               └── label = getBackupLabel(true) → "Automático - {data}"
       │
       └── Disparado em 2 pontos:
             ├── Line 325: após sync de playtime (non-Steam)
             └── Line 456: após sync de playtime (Steam com remoteId)
```

### 3. Preview de Backup (Ludusavi local)

```
Renderer :: getGameBackupPreview()
       │
       ▼  IPC invoke
get-game-backup-preview.ts :: "getGameBackupPreview"
       │
       ▼
Ludusavi.getBackupPreview(shop, objectId, winePrefix)
       │
       ├── Lê config.yaml do Ludusavi
       ├── spawn: ludusavi backup <id> --api --force --preview --wine-prefix <pfx>
       ├── Parse JSON output
       ├── Merge com custom backup path (se configurado)
       └── Retorna LudusaviBackup

Renderer:
  ├── Deriva backupState: New / Different / Same / Unknown
  └── Exibe no painel
```

### 4. Download/Restore (STUB)

```
Renderer :: downloadGameArtifact(gameArtifactId)
       │
       ▼  IPC invoke
download-game-artifact.ts :: "downloadGameArtifact"
       │
       └── STUB: só envia evento de completo
             └── webContents.send("on-backup-download-complete-{objectId}-{shop}")

Renderer recebe → Toast "backup_restored" → refresh
```

> ⚠️ **Nota:** O download/restore real **não está implementado**. O handler IPC registra mas não executa o download. O progresso (`onBackupDownloadProgress`) também está preparado mas não é disparado.

### 5. Listar Artifacts na Nuvem

```
Renderer :: getGameArtifacts()
       │
       ▼  HTTP via forgerApi
GET /profile/games/artifacts?objectId=<id>&shop=<shop>
       │
       └── Requer subscription (needsSubscription: true)
             └── Retorna GameArtifact[]
```

### 6. Gerenciar Artifacts

| Ação | Método HTTP | Endpoint |
|------|-------------|----------|
| Renomear | PUT | `/profile/games/artifacts/{id}` (body: `{ label }`) |
| Deletar | DELETE | `/profile/games/artifacts/{id}` |
| Congelar | PUT | `/profile/games/artifacts/{id}/freeze` |
| Descongelar | PUT | `/profile/games/artifacts/{id}/unfreeze` |

### 7. Alternar Sync Automático

```
Renderer :: toggle checkbox
       │
       ▼  IPC invoke
toggle-automatic-cloud-sync.ts :: "toggleAutomaticCloudSync"
       │
       └── gamesStore.put(gameKey, { ...game, automaticCloudSync: bool })
```

### 8. Configurar Path de Backup Customizado

```
Renderer :: selectGameBackupPath(backupPath)
       │
       ▼  IPC invoke
select-game-backup-path.ts :: "selectGameBackupPath"
       │
       └── Ludusavi.addCustomGame(objectId, backupPath)
             └── Edita config.yaml do Ludusavi
                   ├── Adiciona entrada com custom file path
                   └── Se null → remove entrada
```

---

## Arquivos Envolvidos

### Main Process

| Arquivo | Função |
|---------|--------|
| `src/main/services/cloud-sync.ts` | Orquestrador: upload, bundle, verificação de subscription |
| `src/main/services/ludusavi.ts` | Integração com binário Ludusavi (backup, preview, config) |
| `src/main/services/wine.ts` | Resolução de Wine prefix |
| `src/main/services/process-watcher.ts` | Trigger automático de upload |
| `src/main/events/cloud-save/upload-save-game.ts` | IPC handler `uploadSaveGame` |
| `src/main/events/cloud-save/download-game-artifact.ts` | IPC handler `downloadGameArtifact` (STUB) |
| `src/main/events/cloud-save/get-game-backup-preview.ts` | IPC handler `getGameBackupPreview` |
| `src/main/events/cloud-save/select-game-backup-path.ts` | IPC handler `selectGameBackupPath` |
| `src/main/events/cloud-save/index.ts` | Barrel que registra todos os handlers |
| `src/main/events/library/toggle-automatic-cloud-sync.ts` | IPC handler `toggleAutomaticCloudSync` |
| `src/main/constants.ts` | `backupsPath = userData/Backups` |

### Preload

| Arquivo | Métodos |
|---------|---------|
| `src/preload/app.ts` | `uploadSaveGame`, `downloadGameArtifact`, `getGameArtifacts`, `getGameBackupPreview`, `selectGameBackupPath`, `onUploadComplete`, `onBackupDownloadProgress`, `onBackupDownloadComplete` |
| `src/preload/library.ts` | `toggleAutomaticCloudSync`, `openGameSaveFolder` |

### Renderer

| Arquivo | Função |
|---------|--------|
| `src/renderer/src/context/cloud-sync/cloud-sync.context.tsx` | Context provider com estado e ações |
| `src/renderer/src/pages/game-details/cloud-sync/cloud-sync-panel.tsx` | UI do painel de cloud sync |
| `src/renderer/src/pages/game-details/cloud-sync-rename-artifact-modal/cloud-sync-rename-artifact-modal.tsx` | Modal de renomear artifact |

### Types

| Arquivo | Interface |
|---------|-----------|
| `src/types/index.ts` | `GameArtifact` |
| `src/types/ludusavi.types.ts` | `LudusaviBackup`, `LudusaviConfig`, `LudusaviGame` |
| `src/types/level.types.ts` | `Game.automaticCloudSync` |

---

## Eventos IPC

### Invoke (Renderer → Main)

| Canal | Parâmetros | Descrição |
|-------|-----------|-----------|
| `uploadSaveGame` | `objectId, shop, downloadOptionTitle` | Upload manual |
| `downloadGameArtifact` | `objectId, shop, gameArtifactId` | Download/restore (STUB) |
| `getGameBackupPreview` | `objectId, shop` | Preview local via Ludusavi |
| `selectGameBackupPath` | `shop, objectId, backupPath` | Configurar path customizado |
| `toggleAutomaticCloudSync` | `shop, objectId, bool` | Alternar sync automático |

### Push (Main → Renderer)

| Canal | Payload | Quando |
|-------|---------|--------|
| `on-upload-complete-{id}-{shop}` | `void` | Upload terminou |
| `on-backup-download-complete-{id}-{shop}` | `void` | Download terminou |
| `on-backup-download-progress-{id}-{shop}` | `AxiosProgressEvent` | Progresso do download |

---

## Integração Ludusavi

Ludusavi é um binário third-party para backup de saves. Integração:

```
Binary:   {userData}/ludusavi/ludusavi
Config:   {userData}/ludusavi/config.yaml
Backups:  {userData}/Backups/{shop}-{objectId}/
```

**Comando executado:**
```bash
ludusavi --config {configPath} backup {objectId} \
  --api --force \
  --path {backupPath} \
  --wine-prefix {prefix}
```

- `--api`: saída JSON
- `--force`: sobrescreve backups existentes
- `--preview`: modo simulação (não executa)
- `--wine-prefix`: resolve paths Windows → Linux

**Config YAML editado por** `Ludusavi.addCustomGame()`:
```yaml
games:
  custom_{objectId}:
    files:
      - "{customBackupPath}"
```

---

## Armazenamento

| Chave | Campo | Uso |
|-------|-------|-----|
| `user` | `subscription.expiresAt` | Gating de upload |
| `game(shop, objectId)` | `automaticCloudSync` | Flag de sync automático |
| `game(shop, objectId)` | `winePrefixPath` | Path do prefixo para backup |

---

## Fluxo de Dados do Upload

```
Game fecha
    │
    ▼
ProcessWatcher detecta
    │
    ▼
automaticCloudSync?
    │
    ├── SIM → CloudSync.uploadSaveGame()
    │           ├── Check subscription (armazenamento)
    │           ├── Ludusavi.backupGame() → saves no disco
    │           ├── tar.create() → .tar
    │           ├── Notifica renderer
    │           └── Limpa .tar
    │
    └── NÃO → faz nada
```

---

## Status da Implementação

| Funcionalidade | Status |
|----------------|--------|
| Upload manual | ✅ Completo |
| Upload automático | ✅ Completo |
| Preview Ludusavi | ✅ Completo |
| Listar artifacts (nuvem) | ✅ Completo |
| Renomear artifact | ✅ Completo |
| Deletar artifact | ✅ Completo |
| Congelar/Descongelar | ✅ Completo |
| Path de backup customizado | ✅ Completo |
| Download/Restore | 🔴 **STUB** — não implementado |
| Progresso de download | 🟡 Preparado mas nunca disparado |
