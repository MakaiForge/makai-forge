# Integração nos 3 fluxos de instalação

A Installer API é usada por 3 fluxos diferentes. Cada um passa o parâmetro `source` para identificar a origem.

## Fluxo 1: Catálogo / Download

**Arquivo:** `src/main/install-flow/orchestrator.ts`

**source:** `"catalog"`

**Quando:** O usuário clica "Instalar" no catálogo ou após um download completo.

**Integração:**

```typescript
// orchestrator.ts
import { analyze, extract } from '../../compatflow/bridge/installer';

async function installAndScan(options: InstallOptions) {
  // ... setup prefix, install DLLs ...

  // Analisa o instalador baixado
  const installInfo = await analyze(downloadPath);

  // Extrai conforme o tipo detectado
  const extractResult = await extract(installInfo, {
    destPath: prefixPath + '/drive_c/games/' + gameId,
    protonPath,
    source: 'catalog',
    gameId,
    onProgress: (msg) => reportProgress(msg)
  });

  // Se extraiu com sucesso, escaneia por executáveis
  if (extractResult.success) {
    const candidates = scanPrefixForExes(prefixPath);
    // ...
  }
}
```

**Mudanças necessárias:**
- `orchestrator.ts` atualmente chama o bridge via subprocess (`--deps-only`)
- Depois da migração, chama o classifier direto (import) ANTES de rodar o instalador no Wine
- Se o classifier disser que extração nativa é possível, faz ela primeiro e pula a etapa Wine

---

## Fluxo 2: Manual (Add Game)

**Arquivos:**
- `src/main/events/library/open-game/execute-installer.ts`
- `src/main/events/library/open-game/handle-portable.ts`
- `src/main/events/library/open-game/handle-prefix.ts`

**source:** `"manual"`

**Quando:** O usuário vai na aba Games e clica em "Adicionar Jogo" → seleciona um arquivo/pasta.

**Integração:**

```typescript
// execute-installer.ts
import { analyze, extract } from '../../../compatflow/bridge/installer';

async function handleInstaller(installerPath: string) {
  // Analisa o instalador selecionado pelo usuário
  const info = await analyze(installerPath);

  // Extrai
  const result = await extract(info, {
    destPath: prefixPath + '/drive_c/games/' + gameId,
    protonPath,
    source: 'manual',
    gameId,
    onProgress
  });

  if (result.success) {
    // Continua o fluxo normal de scan
  }
}
```

**Mudanças necessárias:**
- `execute-installer.ts` atualmente chama `installAndScan()` do orchestrator
- Vai passar a chamar o classifier + extractor diretamente
- `handle-portable.ts` continua existindo mas agora também passa pelo classifier (que vai detectar como `portable`)

---

## Fluxo 3: CompactFlow (Bridge legada)

**Arquivo:** `src/compatflow/bridge/install-game/index.js`

**source:** `"compactflow"`

**Quando:** Chamado via subprocess pelo CompactFlow (deploy manual, fora do Makai Forger).

**Integração:**

```javascript
// index.js (main)
const { analyze, extract } = require('../installer');

async function main() {
  // ... argument parsing ...

  // Antes de rodar o instalador via Wine, analisa
  const info = await analyze(exePath);

  // Extrai conforme o tipo
  const result = await extract(info, {
    destPath: prefixPath + '/drive_c/games/' + gameId,
    protonPath,
    source: 'compactflow',
    gameId,
    onProgress: (msg) => logger.log(L, msg)
  });

  // Se o extractor já fez tudo (não precisa de Wine), só escaneia
  if (result.success && !result.registryNeeded) {
    // Pula Step 5 (runInstaller)
    const { candidates } = scanPrefixForExes(prefixPath);
    // ...
  } else {
    // Se precisa de registry, roda o instalador
    // Step 5: runInstaller(...)
    // (ou melhor: extractor já rodou o wine-fallback)
  }
}
```

**Mudanças necessárias:**
- `index.js` chama o classifier ANTES do Step 5
- Se o método não precisar de Wine, pula o `runInstaller()` completamente
- Se precisar de Wine (exe-companions registry), roda só pra registry

---

## Comparativo: antes vs depois

### Antes (todos os fluxos)

```
Arquivo → create_prefix → install_dlls → install_deps → runInstaller(Wine) → scan
                                                          └── Wine extrai TUDO (lento)
```

### Depois (com Installer API)

```
Arquivo → analyze() → create_prefix → install_dlls → install_deps → extract() → scan
                                                                      │
                                               ┌───────────────────────┴──────┐
                                               │ Nativo (archive, sfx, inno, │
                                               │ portable, iso)             │
                                               │ → Rápido (segundos/minutos) │
                                               │                              │
                                               │ ou Wine (inno-custom,       │
                                               │ unknown)                     │
                                               │ → Lento (fallback)           │
                                               └──────────────────────────────┘
```

## Parâmetro `source`

O parâmetro `source` é obrigatório e indica **qual fluxo de instalação** está chamando a API.

**Usos:**
1. **Logging e debug** — sabermos qual fluxo mais usa cada método
2. **Estatísticas futuras** — podemos coletar métricas anônimas
3. **Comportamento específico** — se necessário, cada fluxo pode ter pequenas variações
4. **Rastreabilidade** — quando algo dá errado, sabemos exatamente qual fluxo causou

**Valores possíveis:**

| source | Fluxo | Arquivo principal |
|---|---|---|
| `"catalog"` | Catálogo / Download | `orchestrator.ts` |
| `"manual"` | Add Game manual | `execute-installer.ts` |
| `"compactflow"` | CompactFlow legado | `index.js` (bridge) |

## Resumo das mudanças aplicadas

| Arquivo | Mudança |
|---|---|
| `orchestrator.ts` | Step 3 novo: chama Installer API via subprocess (`--analyze` + `--extract`). Se nativo, pula Wine. Se falhar, cai no fallback. |
| `execute-installer.ts` | Sem mudanças (delega ao `orchestrator.ts` via `installAndScan`) |
| `handle-portable.ts` | Sem mudanças (contínua copiando pastas) |
| `install-game/index.js` (bridge) | Step 5 modificado: chama `analyze()` + `extract()` direto (require). Se nativo falha, cai no `runInstaller()` de fallback. |
