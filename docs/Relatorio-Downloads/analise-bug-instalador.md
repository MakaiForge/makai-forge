# Análise de Bug: Jogo Instalado via Setup/Install Não Salva Executável

> Data: 2026-08-18
> Severidade: 🔴 Crítico
> Sintoma: Jogos instalados via instalador (setup.exe) vão para aba Games mas ao clicar Play pede para encontrar arquivos novamente

---

## 1. Sintoma Descrito

1. Usuário baixa jogo na aba Downloads
2. Extração completa
3. ProtonRecommendationModal aparece → usuário seleciona Proton
4. Instalador roda (setup.exe)
5. Scan encontra executáveis no prefixo
6. Usuário seleciona e clica "Confirmar"
7. Jogo aparece na aba Games ✅
8. Usuário clica Play → **pede para encontrar arquivos novamente** ❌
9. Mesmo selecionando e salvando, pede de novo ❌

---

## 2. Fluxo Mapeado (com bug)

```
Downloads Tab
  │
  ├─ Download completo → extração OK
  │
  ├─ ProtonRecommendationModal → usuário seleciona Proton
  │
  └─ openGameInstaller(shop, objectId, protonPath, gameTitle)
       │
       ├─ effectiveWinePrefixPath = Wine.getEffectivePrefixPath(...)
       │   ⚠️ COMPUTA mas NÃO SALVA no game!
       │
       ├─ setupPrefix() → cria prefixo Wine
       │
       ├─ installGame(sourcePath, { prefixPath, protonPath, ... })
       │    │
       │    ├─ detect_installer_type() → "instalador"
       │    ├─ snapshot_prefix() → antes
       │    ├─ run_installer_in_container() → executar setup.exe
       │    ├─ snapshot_prefix() → depois
       │    ├─ find_new_executables() → encontra game.exe
       │    └─ Retorna candidates com path DENTRO do prefixo
       │
       └─ returnOrSelect() → abre ExecutableSelectWindow
            │
            └─ Usuário seleciona → confirmExecutableSelection()
                 │
                 ├─ gamesStore.put(gameKey, { executablePath, ... })
                 │   ⚠️ winePrefixPath pode ser NULL!
                 │
                 └─ saveGameJson() → salva no disco

Games Tab (Play)
  │
  └─ openGame(shop, objectId, executablePath)
       │
       ├─ exeInsidePrefix = game.executablePath.startsWith(driveC)
       │   ⚠️ driveC é NULL se winePrefixPath não foi salvo!
       │   → exeInsidePrefix = false (SEMPRE)
       │
       ├─ sourcePath = path.dirname(executablePath)
       │   ← pasta DENTRO do prefixo
       │
       ├─ installGame(sourcePath, { existingExePath })
       │   ⚠️ tenta copiar DE prefixo PARA prefixo (circular!)
       │
       └─ Retorna candidatos → mostra seleção de exe de novo
            → ciclo infinito ♻️
```

---

## 3. Causa Raiz (3 bugs encadeados)

### Bug A: `openGameInstaller` não salva `winePrefixPath`

**Arquivo:** `app/_main/installer-api/ForgePipeline/events/open-game-installer.ts`

```typescript
// Linha 60-65
const effectiveWinePrefixPath = Wine.getEffectivePrefixPath(null, objectId, effectiveGameTitle);

// ... setupPrefix roda ...

// Só salva protonPath, NÃO salva winePrefixPath:
if (objectId && effectiveProtonPath && game && !game.protonPath) {
    game.protonPath = effectiveProtonPath;
    game.protonVersion = path.basename(effectiveProtonPath);
    await gamesStore.put(downloadKey, game);  // ← winePrefixPath NÃO salvo!
}
```

**Impacto:** `game.winePrefixPath` permanece null/undefined depois da instalação.

### Bug B: `confirmExecutableSelection` herda `winePrefixPath` null

**Arquivo:** `app/_main/installer-api/ForgePipeline/events/executable-select-window.ts`

```typescript
const winePrefixPath =
    game.winePrefixPath ||
    Wine.getEffectivePrefixPath(game.winePrefixPath, objectId, game.title);
```

Tenta fallback mas `game.winePrefixPath` é null e `Wine.getEffectivePrefixPath(null, ...)` pode retornar um path diferente do que foi usado na instalação.

### Bug C: `openGame` entra em ciclo infinito

**Arquivo:** `app/_main/installer-api/ForgePipeline/events/open-game/open-game.ts`

```typescript
const driveC = actualPrefix ? path.join(actualPrefix, "drive_c") : null;
const exeInsidePrefix = game.executablePath &&
    (driveC && game.executablePath.startsWith(driveC) || ...);
```

Se `winePrefixPath` é null → `actualPrefix` é null → `driveC` é null → `exeInsidePrefix` é false → tenta reinstalar → ciclo.

---

## 4. Correções Propostas

### Fix A: Salvar `winePrefixPath` no `openGameInstaller`

```typescript
// openGameInstaller.ts
// ADICIONAR: salvar winePrefixPath no game
if (objectId && game) {
    const updates: any = {};
    if (effectiveProtonPath && !game.protonPath) {
        updates.protonPath = effectiveProtonPath;
        updates.protonVersion = path.basename(effectiveProtonPath);
    }
    if (effectiveWinePrefixPath && !game.winePrefixPath) {
        updates.winePrefixPath = effectiveWinePrefixPath;
    }
    if (Object.keys(updates).length > 0) {
        await gamesStore.put(downloadKey, { ...game, ...updates });
    }
}
```

### Fix B: `openGame` — se exe está no prefixo e existe, launch direto

```typescript
// open-game.ts
// MELHORAR: verificar se o exe existe mesmo sem winePrefixPath salvo
if (game.executablePath && fs.existsSync(game.executablePath)) {
    // Verificar se está dentro de qualquer prefix conhecido
    const isInsideAnyPrefix = game.executablePath.includes("/drive_c/") ||
                              game.executablePath.includes("/pfx/drive_c/");
    if (isInsideAnyPrefix) {
        sendProgress("complete", "Iniciando...");
        await launchGame({ ... });
        return;
    }
}
```

### Fix C: `openGame` — evitar ciclo de reinstalação

```typescript
// open-game.ts
// ADICIONAR: check se sourcePath já está no prefixo
const sourcePath = path.dirname(game.executablePath);
const isSourceInsidePrefix = sourcePath.includes("/drive_c/") ||
                              sourcePath.includes("/pfx/drive_c/");
if (isSourceInsidePrefix) {
    // Já está no prefixo — não reinstalar, apenas lançar
    sendProgress("complete", "Jogo já instalado. Iniciando...");
    await launchGame({ ... });
    return;
}
```

---

## 5. Arquivos Afetados

| Arquivo | Bug | Fix |
|---------|-----|-----|
| `open-game-installer.ts` | A | Salvar winePrefixPath |
| `open-game.ts` | C | Evitar ciclo, launch direto |
| `executable-select-window.ts` | B | Garantir fallback correto |

---

## 6. Fluxo Corrigido

```
Downloads Tab
  │
  ├─ openGameInstaller()
  │    ├─ Salva winePrefixPath ✅ (Fix A)
  │    ├─ Salva protonPath ✅
  │    └─ Retorna candidatos
  │
  └─ confirmExecutableSelection()
       ├─ game.winePrefixPath já existe ✅
       └─ Salva exe + prefix corretamente ✅

Games Tab (Play)
  │
  └─ openGame()
       ├─ exeInsidePrefix = true (winePrefixPath existe) ✅
       ├─ fs.existsSync(exe) → true ✅
       └─ launchGame() → jogo abre ✅
```

---

## 7. Validação

Após a correção, testar:
1. Baixar jogo com setup.exe
2. Selecionar Proton
3. Instalador roda
4. Selecionar exe
5. Clicar Play na aba Games → deve abrir direto
6. Fechar e abrir app → Play deve continuar funcionando
