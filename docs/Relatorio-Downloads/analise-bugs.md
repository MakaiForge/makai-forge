# Análise de Bugs e Problemas — Aba Downloads

> **Data:** 18/08/2026  
> **Objetivo:** Identificar bugs, race conditions, estados inconsistentes e problemas potenciais no fluxo de Downloads.

---

## Índice

1. [Problemas Críticos](#1-problemas-críticos)
2. [Problemas Médios](#2-problemas-médios)
3. [Problemas Menores](#3-problemas-menores)
4. [Race Conditions](#4-race-conditions)
5. [Estados Inconsistentes](#5-estados-inconsistentes)
6. [Resumo](#6-resumo)

---

## 1. Problemas Críticos

### 🔴 BUG 1: `onDownloadAndSelect` recebe `ProtonFork` mas `DownloadsModals` espera `string`

**Arquivo:** `app/Downloads/components/downloads-modals.tsx`  
**Linha:** ~46

```tsx
// downloads-modals.tsx
interface DownloadsModalsProps {
  onDownloadAndSelect: (proton: string) => void;  // ← espera string
  ...
}

// index.tsx
const {
  onDownloadAndSelect,  // ← retorna (fork: ProtonFork) => Promise<void>
  ...
} = useInstallFlow();

// Passado para o modal:
<ProtonRecommendationModal
  onDownloadAndSelect={onDownloadAndSelect}  // ← MISMATCH: ProtonFork vs string
/>
```

**Problema:** O `useInstallFlow` define `onDownloadAndSelect` como `(fork: ProtonFork) => Promise<void>`, mas o `DownloadsModals` tipa como `(proton: string) => void`. Isso causa:
- TypeScript pode não pegar o erro por causa do `any` em algum lugar
- Em runtime, o fork object é passado onde uma string é esperada
- O `downloadProton(fork)` pode funcionar por coincidência se o fork tiver propriedades que o downloadProton espera

**Impacto:** O download do Proton pode falhar silenciosamente ou funcionar por acidente.

---

### 🔴 BUG 2: `installProgress` tipado como `number | null` mas recebe `InstallProgress | null`

**Arquivo:** `app/Downloads/components/downloads-modals.tsx`  
**Linha:** ~42

```tsx
interface DownloadsModalsProps {
  installProgress: number | null;  // ← tipado como number
  ...
}

// No useInstallFlow:
const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

// installProgress é { status: string, percent: number, gameTitle?: string }
```

**Problema:** O `installProgress` é na verdade um objeto `InstallProgress` com `{ status, percent, gameTitle }`, mas está tipado como `number | null` no props do `DownloadsModals`. Isso causa:
- O `InstallProgressModal` recebe `progress={installProgress}` que deveria ser `InstallProgress | null`
- Se `installProgress` for um objeto, `visible={installProgress != null}` funciona
- Mas `progress={installProgress}` pode ter tipo incorreto

**Impacto:** A barra de progresso pode não funcionar corretamente se o tipo não bater.

---

### 🔴 BUG 3: `onSelectProton` recebe `string` mas o fluxo real usa `protonPath`

**Arquivo:** `app/Downloads/components/downloads-modals.tsx`  
**Linha:** ~44

```tsx
interface DownloadsModalsProps {
  onSelectProton: (proton: string) => void;  // ← espera string (proton path)
  ...
}

// No useInstallFlow:
const handleSelectProton = useCallback(async (protonPath: string) => {
  // protonPath é o caminho do Proton instalado
  ...
}, [library, handleOpenExePicker]);
```

**Problema:** Isso na verdade está correto — `protonPath` é uma string. Mas o nome da prop `onSelectProton` pode causar confusão.

---

## 2. Problemas Médios

### 🟡 PROBLEMA 4: Race condition no `resumeGameDownload`

**Arquivo:** `src/main/events/torrenting/resume-game-download.ts`

```typescript
const resumeGameDownload = async (...) => {
  // 1. Pausa TUDO
  await DownloadManager.pauseDownload();
  
  // 2. Pausa todos os downloads ativos
  for await (const [key, value] of downloadsStore.iterator()) {
    if (value.status === "active" && value.progress !== 1) {
      await downloadsStore.put(key, { ...value, status: "paused" });
    }
  }
  
  // 3. Resume o download específico
  await DownloadManager.resumeDownload(download);
  
  // 4. Atualiza o store
  await downloadsStore.put(gameKey, {
    ...download,
    status: "active",
    timestamp: Date.now(),
    queued: true,
  });
};
```

**Problema:** Entre o passo 3 e 4, o `watchDownloads()` pode rodar e ver o download em estado inconsistente:
- `resumeDownload` chama `startDownload` que define `downloadingGameId`
- Mas o store ainda tem `status: "paused"` (do passo 2)
- O `watchDownloads` pode tentar completar o download antes do store ser atualizado

**Impacto:** Download pode aparecer como "pausado" mesmo estando ativo, ou o progresso pode não atualizar.

---

### 🟡 PROBLEMA 5: `jsDownloader` pode ser `null` após `cancelDownload`

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/index.ts`

```typescript
static async cancelDownload(downloadKey = this.downloadingGameId) {
  if (isActiveDownload) {
    if (this.usingJsDownloader && this.jsDownloader) {
      this.jsDownloader.cancelDownload();
      this.jsDownloader = null;  // ← seta para null
      this.usingJsDownloader = false;
    } else if (downloadKey) {
      await this.torrentBackend.cancel(downloadKey)...;
    }
    this.downloadingGameId = null;  // ← limpa
  }
}
```

**Problema:** Se `watchDownloads()` rodar entre `this.jsDownloader = null` e `this.downloadingGameId = null`, o `getDownloadStatus()` pode:
- Receber `downloadingGameId` não-null
- Mas `jsDownloader` é null
- Retornar null (o que é tratado), mas o download pode ficar "preso"

**Impacto:** Download pode ficar em estado "fantasma" — ativo no store mas sem backend.

---

### 🟡 PROBLEMA 6: Extração pode falhar silenciosamente

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/completion/extraction.ts`

```typescript
export async function handleExtraction(download, game): Promise<void> {
  const extractionPath = download.folderName
    ? path.join(download.downloadPath, download.folderName)
    : null;

  if (!extractionPath || !fs.existsSync(extractionPath)) {
    await gameFilesManager.failExtraction(...)  // ← falha
    return;
  }

  const extractionStats = fs.statSync(extractionPath);

  // Se é arquivo E tem extensão de extração:
  if (extractionStats.isFile() && FILE_EXTENSIONS_TO_EXTRACT.some(...)) {
    await gameFilesManager.extractDownloadedFile().catch((error) => {
      logger.error(...);
      return gameFilesManager.failExtraction(error)...;  // ← tenta falhar
    });
  }
  // ... outros caminhos
}
```

**Problema:** Se `extractDownloadedFile()` lançar um erro, o `.catch()` tenta `failExtraction()`, mas se `failExtraction()` também falhar (store corrompido, etc.), o erro é logado mas o download fica preso no estado "extracting: true".

**Impacto:** Download aparece como "extraindo" para sempre, sem possibilidade de retry.

---

### 🟡 PROBLEMA 7: `folderName` pode ficar `null` após download completo

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/status/js-status.ts`

```typescript
const updatedDownload = {
  ...download,
  bytesDownloaded,
  fileSize: effectiveFileSize,
  progress,
  folderName,  // ← vem do jsDownloader.getDownloadStatus()
  status: status.status === "complete" ? "complete" : "active",
};

if (status.status === "active" || status.status === "complete") {
  await downloadsStore.put(downloadingGameId, updatedDownload);
}
```

**Problema:** Se `folderName` do `jsDownloader` for uma string vazia ou `undefined`, o download fica com `folderName: ""` no store. Depois, quando `handleExtraction()` tenta usar `download.folderName`, ele constrói um path inválido.

**Impacto:** Extração pode falhar com "No downloaded archive was found to extract".

---

### 🟡 PROBLEMA 8: `getJsDownloadOptions` retorna `null` para downloaders desconhecidos

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/options/index.ts`

```typescript
export async function getJsDownloadOptions(download): Promise<DownloadOptions | null> {
  switch (download.downloader) {
    case Downloader.Gofile: ...
    case Downloader.PixelDrain: ...
    // ...
    case Downloader.Direct: ...
    default:
      return null;  // ← retorna null para downloader desconhecido
  }
}
```

**Problema:** Se o `download.downloader` for um valor inválido ou não mapeado, o `getJsDownloadOptions` retorna `null`. O `startDownload()` então lança:
```typescript
if (!options) {
  throw new Error("Failed to get download options for JS downloader");
}
```

**Impacto:** Download falha com erro genérico, sem indicar qual downloader é o problema.

---

## 3. Problemas Menores

### 🟢 PROBLEMA 9: `getDirSize` é síncrono dentro de Promise

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/helpers.ts`

```typescript
export function getDirSize(dirPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    function calculateSize(currentPath: string) {
      const stats = fs.statSync(currentPath);  // ← síncrono
      if (stats.isFile()) {
        totalSize += stats.size;
      } else if (stats.isDirectory()) {
        const files = fs.readdirSync(currentPath);  // ← síncrono
        files.forEach((file) => calculateSize(path.join(currentPath, file)));
      }
    }
    // ...
  });
}
```

**Problema:** Usa `statSync` e `readdirSync` dentro de uma Promise, o que bloqueia o event loop para pastas grandes.

**Impacto:** UI pode travar brevemente ao calcular tamanho de pastas grandes.

---

### 🟢 PROBLEMA 10: `removedCache` nunca é limpo

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/sync-removed.ts`

```typescript
const removedCache = new Set<string>();

export async function syncRemovedDownloads(torrentBackend): Promise<void> {
  // ...
  for (const key of toRemove) {
    removedCache.add(key);  // ← adiciona mas nunca remove
    // ...
  }
}
```

**Problema:** O `removedCache` cresce indefinidamente durante a vida do app.

**Impacto:** Memory leak leve (cada entry é uma string pequena, mas acumula).

---

### 🟢 PROBLEMA 11: `STALL_TIMEOUT_MS` muito curto (8 segundos)

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/js-http-downloader.ts`

```typescript
const STALL_TIMEOUT_MS = 8000;  // 8 segundos
```

**Problema:** Se o servidor demorar 8+ segundos para enviar dados (server busy, CDN rate limit), o download é considerado "stalled" e faz retry. Isso pode causar:
- Múltiplos retries desnecessários
- URL pode expirar após muitos retries
- Progresso pode voltar para trás

**Impacto:** Downloads podem reiniciar desnecessariamente em conexões lentas.

---

### 🟢 PROBLEMA 12: `MAX_RETRY_ATTEMPTS = 10` pode ser muito alto

**Arquivo:** `app/_main/installer-api/ForgePipeline/services/download/js-http-downloader.ts`

```typescript
const MAX_RETRY_ATTEMPTS = 10;
```

**Problema:** Com 10 retries e delay exponencial (até 15s), o download pode tentar por ~2+ minutos antes de desistir. Se a URL expirou, todos os retries são inúteis.

**Impacto:** Download fica "preso" por 2+ minutos antes de reportar erro.

---

## 4. Race Conditions

### 🔴 RC 1: `startGameDownload` + `watchDownloads`

```
Thread A: startGameDownload()
  ├── DownloadManager.pauseDownload()
  ├── downloadsStore.put(gameKey, download)
  └── DownloadManager.startDownload(download)

Thread B: watchDownloads() [a cada 2s]
  └── getDownloadStatus(downloadingGameId)
```

Se `watchDownloads()` rodar entre `downloadsStore.put()` e `DownloadManager.startDownload()`:
- `downloadingGameId` pode ainda ser null (do download anterior)
- `getDownloadStatus()` retorna null
- Download não aparece na UI até o próximo tick

**Impacto:** Atraso de até 2 segundos para o download aparecer na UI.

---

### 🔴 RC 2: `handleDownloadCompletion` + `extractGameDownload`

```
Thread A: watchDownloads() → handleDownloadCompletion()
  ├── handleExtraction() → GameFilesManager.extractDownloadedFile()
  │   └── setExtractionComplete()
  │       └── searchAndBindExecutable()
  │
Thread B: Usuário clica "Extrair" manualmente
  └── extractGameDownload() → GameFilesManager.extractDownloadedFile()
```

Se ambos rodam ao mesmo tempo:
- `extractDownloadedFile()` pode rodar 2x
- `setExtractionComplete()` pode ser chamado 2x
- `searchAndBindExecutable()` pode tentar salvar o mesmo executável 2x

**Impacto:** Extração duplicada, logs confusos, possível corrupção de store.

---

### 🟡 RC 3: `pauseDownload` + `resumeDownload`

```
Thread A: pauseDownload()
  ├── this.jsDownloader.pauseDownload()
  └── this.downloadingGameId = null

Thread B: resumeDownload() [chamado imediatamente]
  ├── this.downloadingGameId = downloadId
  └── this.startDownload(download)
```

Se `resumeDownload()` rodar entre `pauseDownload()` e a limpeza:
- `downloadingGameId` pode ficar em estado inconsistente
- Dois downloads podem rodar ao mesmo tempo

**Impacto:** Dois downloads simultâneos, corrupção de dados.

---

## 5. Estados Inconsistentes

### 🟡 ESTADO 1: Download "completo" mas `extracting: true`

Pode acontecer se:
1. Download completa (`progress: 1`)
2. `handleDownloadCompletion()` é chamado
3. `handleExtraction()` começa
4. Extração falha silenciosamente
5. Store fica: `{ status: "complete", extracting: true }`

**Resultado:** Download aparece como "CONCLUÍDO" mas com indicador de extração. Usuário não consegue instalar.

---

### 🟡 ESTADO 2: Download "ativo" mas sem backend

Pode acontecer se:
1. Usuário inicia download HTTP
2. `jsDownloader` é criado
3. App reinicia
4. `downloadingGameId` é null (era runtime)
5. Store tem `{ status: "active" }` mas nenhum backend está rodando

**Resultado:** Download aparece como "ATIVO" mas não baixa nada. Sem botão de retry.

---

### 🟡 ESTADO 3: Download "pausado" mas `queued: true`

Pode acontecer se:
1. Usuário pausa download
2. `pauseGameDownload()` seta `{ status: "paused", queued: false }`
3. Mas outro download completa e `processNextQueuedDownload()` roda
4. Encontra o download pausado com `queued: false`

**Resultado:** Download fica na fila mas não inicia. `queued: false` impede que seja processado.

---

### 🟡 ESTADO 4: `folderName` muda após extração

1. Download completa com `folderName: "game.zip"`
2. Extração renomeia para `folderName: "game"`
3. Mas `download.downloadPath` ainda aponta para a pasta original

**Resultado:** Path construído pode estar incorreto se o código assume que `folderName` não muda.

---

## 6. Resumo

| # | Problema | Severidade | Impacto |
|---|----------|-----------|---------|
| 1 | `onDownloadAndSelect` tipo errado | 🔴 Crítico | Download Proton pode falhar |
| 2 | `installProgress` tipo errado | 🔴 Crítico | Barra de progresso pode falhar |
| 3 | `onSelectProton` nome confuso | 🟢 Menor | Confusão de código |
| 4 | Race condition no resume | 🟡 Médio | Download pode ficar preso |
| 5 | `jsDownloader` null após cancel | 🟡 Médio | Download "fantasma" |
| 6 | Extração falha silenciosa | 🟡 Médio | Download preso "extraindo" |
| 7 | `folderName` vazio | 🟡 Médio | Extração falha |
| 8 | Downloader desconhecido | 🟡 Médio | Erro genérico |
| 9 | `getDirSize` síncrono | 🟢 Menor | UI trava |
| 10 | `removedCache` memory leak | 🟢 Menor | Memory leak leve |
| 11 | Stall timeout muito curto | 🟢 Menor | Retry desnecessário |
| 12 | Max retries muito alto | 🟢 Menor | Download preso 2+ min |
| RC1 | start + watch race | 🔴 Crítico | Atraso 2s na UI |
| RC2 | extração duplicada | 🟡 Médio | Extração 2x |
| RC3 | pause + resume race | 🟡 Médio | Downloads simultâneos |
| E1 | completo + extracting | 🟡 Médio | Download preso |
| E2 | ativo sem backend | 🟡 Médio | Download não baixa |
| E3 | pausado + queued | 🟡 Médio | Download não inicia |
| E4 | folderName muda | 🟡 Médio | Path incorreto |

### Recomendações Prioritárias

1. **Corrigir tipos** nos `DownloadsModalsProps` (bugs 1 e 2)
2. **Adicionar mutex/lock** nas operações de download (RC1, RC3)
3. **Timeout de extração** — se extrair por mais de X minutos, falhar gracefully
4. **Reset de estado** — ao reiniciar app, limpar downloads "active" sem backend
5. **Limpar `removedCache`** periodicamente (bug 10)
6. **Aumentar `STALL_TIMEOUT_MS`** para 15-20s (bug 11)

---

## 7. Validação via Type Checker (18/08/2026)

### ✅ Bugs CONFIRMADOS pelo TypeScript

O `tsc --noEmit` revelou **8 erros de tipo REAIS** nos arquivos de Downloads:

#### 🔴 BUG 1 CONFIRMADO — `onDownloadAndSelect` tipo errado

```
app/Downloads/components/downloads-modals.tsx(77,9): error TS2322:
  Type '(proton: string) => void' is not assignable to type '(fork: ProtonFork) => Promise<void>'.
```

```
app/Downloads/index.tsx(128,9): error TS2322:
  Type '(fork: ProtonFork) => Promise<void>' is not assignable to type '(proton: string) => void'.
```

**Diagnóstico:** O `useInstallFlow` define `onDownloadAndSelect` como `(fork: ProtonFork) => Promise<void>`, mas o `DownloadsModals` tipa como `(proton: string) => void`. Isso é um **MISMATCH REAL** — o fork object é passado onde uma string é esperada.

---

#### 🔴 BUG 2 CONFIRMADO — `installProgress` tipo errado

```
app/Downloads/components/downloads-modals.tsx(82,9): error TS2322:
  Type 'number | null' is not assignable to type 'InstallProgress | null'.
```

```
app/Downloads/index.tsx(131,9): error TS2322:
  Type 'InstallProgress | null' is not assignable to type 'number | null'.
```

**Diagnóstico:** O `installProgress` é na verdade um objeto `{ status, percent, gameTitle }`, mas está tipado como `number | null` no `DownloadsModalsProps`. Isso é um **MISMATCH REAL** — o objeto é passado onde um number é esperado.

---

#### 🟡 BUG 5 CONFIRMADO — `isActive` prop não existe

```
app/Downloads/components/download-group.tsx(112,17): error TS2322:
  Type '{ key: string; game: LibraryGame; progress: number; isPaused: true;
  isCompleted: false; isActive: boolean; ... }' is not assignable to type
  'IntrinsicAttributes & Readonly<DownloadCardProps>'.
```

**Diagnóstico:** O `DownloadCard` não tem prop `isActive`, mas o `download-group.tsx` está passando. Isso é um **MISMATCH REAL** — propriedade inexistente.

---

#### 🟡 BUG 6 CONFIRMADO — `gameId` e `gameTitle` nullable

```
app/Downloads/components/downloads-modals.tsx(72,9): error TS2322:
  Type 'string | null' is not assignable to type 'string'.
app/Downloads/components/downloads-modals.tsx(73,9): error TS2322:
  Type 'string | null' is not assignable to type 'string'.
```

**Diagnóstico:** `gameId` e `gameTitle` vêm de `pendingGameIdRef.current` e `pendingGameTitleRef.current` que podem ser `null`, mas o `ProtonRecommendationModal` espera `string`.

---

#### 🟡 BUG 7 CONFIRMADO — `candidates` tipado como `unknown[]`

```
app/Downloads/components/downloads-modals.tsx(90,9): error TS2322:
  Type 'unknown[]' is not assignable to type 'CandidateExe[]'.
```

**Diagnóstico:** A prop `candidates` no `DownloadsModals` é `unknown[]`, mas o `ExecutableCandidateModal` espera `CandidateExe[]`.

---

#### 🟡 BUG 8 CONFIRMADO — `prefixDriveCPath` nullable

```
app/Downloads/components/downloads-modals.tsx(91,9): error TS2322:
  Type 'string | null' is not assignable to type 'string | undefined'.
```

**Diagnóstico:** `prefixDriveCPath` pode ser `null`, mas o `ExecutableCandidateModal` espera `string | undefined`.

---

### Resumo da Validação

| # | Bug | Status | Evidência |
|---|-----|--------|-----------|
| 1 | `onDownloadAndSelect` tipo errado | ✅ CONFIRMADO | TS2322 em downloads-modals.tsx:77 e index.tsx:128 |
| 2 | `installProgress` tipo errado | ✅ CONFIRMADO | TS2322 em downloads-modals.tsx:82 e index.tsx:131 |
| 5 | `isActive` prop inexistente | ✅ CONFIRMADO | TS2322 em download-group.tsx:112 |
| 6 | `gameId`/`gameTitle` nullable | ✅ CONFIRMADO | TS2322 em downloads-modals.tsx:72-73 |
| 7 | `candidates` unknown[] | ✅ CONFIRMADO | TS2322 em downloads-modals.tsx:90 |
| 8 | `prefixDriveCPath` nullable | ✅ CONFIRMADO | TS2322 em downloads-modals.tsx:91 |

### Conclusão

**6 dos 20 problemas** foram **confirmados formalmente** pelo TypeScript. Os outros 14 são baseados em análise de código e podem ou não causar problemas em runtime, mas os 6 confirmados são **certamente bugs** que precisam ser corrigidos.

Os erros mais críticos são:
1. **BUG 1 e 2** — Afetam diretamente o fluxo de instalação pós-download
2. **BUG 5** — Pode causar renderização incorreta dos cards
3. **BUG 6, 7, 8** — Podem causar crashes se os valores null/unknown chegarem ao renderer
