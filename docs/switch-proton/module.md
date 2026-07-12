# Módulo: Trocar Proton por Jogo — Plano de Implementação

## Objetivo
Permitir ao usuário trocar a versão do Proton de um jogo específico, recriando o prefixo Wine preservando saves e configurações do usuário.

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI (React)                               │
│  GameConfigPanel → Seleciona novo Proton → "Trocar Proton"      │
│  ProtonRecommendationModal → Lista protons instalados/baixáveis │
└──────────────┬──────────────────────────────────┬───────────────┘
               │ ipcRenderer.invoke               │
               ▼                                  ▼
┌──────────────────────────────────┐ ┌──────────────────────────────┐
│  modSwitchProton (IPC handler)   │ │  setupProtonEnvironment (já  │
│  NOVO — preserva saves           │ │  existe, mas só funciona p/  │
│  1. Lê config do jogo            │ │  jogos Steam com compatdata) │
│  2. Salva save paths             │ └──────────────────────────────┘
│  3. Deleta prefixo antigo        │
│  4. Cria prefixo novo            │
│  5. Restaura saves               │
│  6. Re-instala DLLs              │
│  7. Atualiza config do jogo      │
│  8. Re-deploy mods               │
└──────────────┬───────────────────┘
               │ ProtonForgeRPC.call()
               ▼
┌──────────────────────────────────┐
│  Python API (handler.py)         │
│  NOVOS métodos:                  │
│  - delete_prefix (já existe)     │
│  - clean_prefix (já existe)      │
│  - get_prefix_saves (NOVO)       │
│  - restore_saves (NOVO)          │
└──────────────────────────────────┘
```

---

## Fase 1: API Python — Expor funções existentes + novos métodos

### Arquivos a modificar

#### 1.1 `tools/python-rpc/protonforge-api/api/handler.py`
**Ação**: Adicionar 3 novos métodos RPC

```python
# ── Método NOVO: delete_prefix ──
@register("delete_prefix")
def handle_delete_prefix(params: dict) -> dict:
    """Deleta um prefixo Wine/Proton.

    Args:
        params: Deve conter "prefix_path" (str)

    Retorna:
        Dict com "success" (bool)
    """
    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")

    from prefix.core import delete_prefix
    success = delete_prefix(str(prefix_path))
    return {"success": success}


# ── Método NOVO: clean_prefix ──
@register("clean_prefix")
def handle_clean_prefix(params: dict) -> dict:
    """Limpa um prefixo (remove user.reg/system.reg, mantém estrutura).

    Args:
        params: Deve conter "prefix_path" (str)

    Retorna:
        Dict com "success" (bool)
    """
    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")

    from prefix.core import clean_prefix
    success = clean_prefix(str(prefix_path))
    return {"success": success}


# ── Método NOVO: get_prefix_saves ──
@register("get_prefix_saves")
def handle_get_prefix_saves(params: dict) -> dict:
    """Lista paths de saves dentro do prefixo.

    Args:
        params: Deve conter "prefix_path" (str)
                Opcional: "game_id" (str) para paths específicos

    Retorna:
        Dict com "saves" (list[str]) — caminhos relativos dos saves
    """
    prefix_path = params.get("prefix_path")
    game_id = params.get("game_id")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")

    from pathlib import Path
    pfx = Path(prefix_path)
    saves = []

    # Procura em locations comuns de save
    search_patterns = [
        # Bethesda: Documents/My Games/<Game>
        "drive_c/users/*/Documents/My Games",
        # Steam cloud: drive_c/users/*/AppData/Local/<Game>
        "drive_c/users/*/AppData/Local",
        # Steam cloud: drive_c/users/*/AppData/Roaming/<Game>
        "drive_c/users/*/AppData/Roaming",
        # Proton saves: drive_c/users/*/Documents
        "drive_c/users/*/Documents",
    ]

    for pattern in search_patterns:
        for match in pfx.glob(pattern):
            if match.is_dir():
                # Procura subdiretórios que pareçam ser do jogo
                for child in match.iterdir():
                    if child.is_dir():
                        saves.append(str(child.relative_to(pfx)))

    return {"saves": saves}


# ── Método NOVO: restore_saves ──
@register("restore_saves")
def handle_restore_saves(params: dict) -> dict:
    """Restaura saves de um backup para o novo prefixo.

    Args:
        params: Deve conter:
            "prefix_path" (str) — novo prefixo
            "saves_backup" (list[str]) — caminhos relativos dos saves
            "backup_source" (str) — caminho do prefixo antigo

    Retorna:
        Dict com "restored" (list[str]), "errors" (list[str])
    """
    import shutil
    from pathlib import Path

    prefix_path = params.get("prefix_path")
    saves_backup = params.get("saves_backup", [])
    backup_source = params.get("backup_source")

    if not all([prefix_path, backup_source]):
        raise RpcError("missing_param", "prefix_path and backup_source are required")

    pfx = Path(prefix_path)
    src = Path(backup_source)
    restored = []
    errors = []

    for save_rel in saves_backup:
        src_path = src / save_rel
        dst_path = pfx / save_rel
        if src_path.exists():
            try:
                if dst_path.exists():
                    shutil.rmtree(dst_path)
                shutil.copytree(src_path, dst_path)
                restored.append(save_rel)
            except Exception as e:
                errors.append(f"{save_rel}: {str(e)[:100]}")
        else:
            errors.append(f"{save_rel}: fonte não encontrada")

    return {"restored": restored, "errors": errors}
```

#### 1.2 `data/install-api/proton_recommended/python/api/handler.py`
**Ação**: Adicionar os mesmos 3 métodos (manter sincronizado)

Copiar os mesmos `@register` handlers de 1.1 para este arquivo.

### Métodos que ficam prontos

| Método | RPC Name | O que faz |
|--------|----------|-----------|
| `delete_prefix` | `delete_prefix` | `shutil.rmtree(prefix_path)` |
| `clean_prefix` | `clean_prefix` | Remove user.reg/system.reg, mantém estrutura |
| `get_prefix_saves` | `get_prefix_saves` | Lista dirs de saves no prefixo |
| `restore_saves` | `restore_saves` | Copia saves do prefixo antigo pro novo |

### Teste
```bash
# Testar delete_prefix
echo '{"id":1,"method":"delete_prefix","params":{"prefix_path":"/tmp/test-prefix"}}' | python3 tools/python-rpc/protonforge-api/server.py

# Testar get_prefix_saves
echo '{"id":1,"method":"get_prefix_saves","params":{"prefix_path":"/home/cas/Games/Prefix/skyrim","game_id":"skyrim"}}' | python3 tools/python-rpc/protonforge-api/server.py
```

---

## Fase 2: Electron IPC — Handler `modSwitchProton`

### Arquivo a criar

#### 2.1 `tools/Mods_manager/events/mod-switch-proton.ts`
**Ação**: Criar handler IPC completo

```typescript
import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";
import { ProtonForgeRPC } from "@main/services/protonforge-rpc";
import { logPlay } from "@mods/play/logger";
import { gameDllCatalog } from "../services/game-dlls-service";
import path from "node:path";

type ModGameConfig = {
  gamePath: string;
  stagingDir: string;
  protonPrefix: string;
  protonVersion?: string;
};

registerEvent("modSwitchProton", async (_event, gameId: string, newProtonPath: string) => {
  const config = ModStorageService.get<ModGameConfig | null>(`game:${gameId}:config`);
  if (!config) {
    return { ok: false, error: "Jogo não configurado." };
  }

  const oldProtonPath = config.protonVersion || "";
  const prefixPath = config.protonPrefix || "";

  if (!prefixPath) {
    return { ok: false, error: "Prefixo não configurado." };
  }

  if (oldProtonPath === newProtonPath) {
    return { ok: false, error: "Novo Proton é igual ao atual." };
  }

  logPlay(gameId, "switchProton_started", {
    oldProton: oldProtonPath,
    newProton: newProtonPath,
    prefixPath,
  });

  try {
    // 1. Verificar se novo Proton existe
    const fs = await import("node:fs");
    if (!fs.existsSync(path.join(newProtonPath, "proton"))) {
      return { ok: false, error: `Proton não encontrado em: ${newProtonPath}` };
    }

    // 2. Listar saves no prefixo atual
    const savesResult = await ProtonForgeRPC.call<{
      saves: string[];
    }>("get_prefix_saves", {
      prefix_path: prefixPath,
      game_id: gameId,
    });

    // 3. Criar backup temporário dos saves
    const tmpBackup = `/tmp/makai-forge-backup-${gameId}-${Date.now()}`;
    let backupSuccess = false;

    if (savesResult.saves && savesResult.saves.length > 0) {
      const { execSync } = await import("node:child_process");
      try {
        // Copia saves para backup temporário
        for (const save of savesResult.saves) {
          const src = path.join(prefixPath, save);
          const dst = path.join(tmpBackup, save);
          execSync(`mkdir -p "${path.dirname(dst)}" && cp -a "${src}" "${dst}"`, {
            stdio: "pipe",
          });
        }
        backupSuccess = true;
        logPlay(gameId, "switchProton_backup", {
          saves: savesResult.saves.join(","),
          backupPath: tmpBackup,
        });
      } catch (err) {
        logPlay(gameId, "switchProton_backup_failed", { error: String(err) });
      }
    }

    // 4. Deletar prefixo antigo
    const deleteResult = await ProtonForgeRPC.call<{ success: boolean }>(
      "delete_prefix",
      { prefix_path: prefixPath },
    );

    if (!deleteResult.success) {
      return { ok: false, error: "Falha ao deletar prefixo antigo." };
    }

    // 5. Criar prefixo novo
    const DEP_TO_VERB: Record<string, string> = {
      vcredist: "vcrun2022",
      d3dcompiler_47: "d3dcompiler_47",
      dxvk: "dxvk",
    };

    const extraVerbs: string[] = [];
    const gameInfo = gameDllCatalog.getGame(gameId);
    if (gameInfo?.autoInstallDeps) {
      for (const dep of gameInfo.autoInstallDeps) {
        const verb = DEP_TO_VERB[dep];
        if (verb) extraVerbs.push(verb);
      }
    }
    if (gameInfo?.winetricksComponents?.length) {
      extraVerbs.push(...gameInfo.winetricksComponents);
    }

    const createResult = await ProtonForgeRPC.call<{
      success: boolean;
      prefix_path: string;
      initialized: boolean;
      dlls_installed: string[];
      errors: string[];
    }>("create_prefix", {
      game_id: gameId,
      proton_path: newProtonPath,
      prefix_path: prefixPath,
      auto_dlls: true,
      extra_verbs: [...new Set(extraVerbs)],
    });

    if (!createResult.success) {
      return {
        ok: false,
        error: `Falha ao criar prefixo: ${createResult.errors?.join(", ") || "erro desconhecido"}`,
      };
    }

    // 6. Restaurar saves
    if (backupSuccess && savesResult.saves?.length > 0) {
      const restoreResult = await ProtonForgeRPC.call<{
        restored: string[];
        errors: string[];
      }>("restore_saves", {
        prefix_path: prefixPath,
        saves_backup: savesResult.saves,
        backup_source: tmpBackup,
      });

      logPlay(gameId, "switchProton_restore", {
        restored: restoreResult.restored?.join(","),
        errors: restoreResult.errors?.join(","),
      });
    }

    // 7. Atualizar config do jogo
    ModStorageService.put(`game:${gameId}:config`, {
      ...config,
      protonVersion: newProtonPath,
    });

    // 8. Limpar backup temporário
    if (backupSuccess) {
      const { execSync } = await import("node:child_process");
      try { execSync(`rm -rf "${tmpBackup}"`, { stdio: "pipe" }); } catch {}
    }

    logPlay(gameId, "switchProton_completed", {
      newProton: newProtonPath,
      prefixPath,
      savesRestored: savesResult.saves?.length || 0,
    });

    return {
      ok: true,
      data: {
        newProtonPath,
        prefixPath,
        savesRestored: savesResult.saves?.length || 0,
        dllsInstalled: createResult.dlls_installed || [],
      },
    };
  } catch (err) {
    const msg = String(err).slice(0, 200);
    logPlay(gameId, "switchProton_error", { error: msg });
    return { ok: false, error: msg };
  }
});
```

#### 2.2 Registrar o evento
**Ação**: Adicionar import em `tools/Mods_manager/events/index.ts` (ou onde os eventos são registrados)

### Arquivo a modificar

#### 2.3 `src/preload/index.ts`
**Ação**: Adicionar `modSwitchProton` ao bridge

```typescript
// Adicionar perto de modCreatePrefix (linha ~1155)
modSwitchProton: (gameId: string, protonPath: string) =>
  ipcRenderer.invoke("modSwitchProton", gameId, protonPath),
```

#### 2.4 `src/renderer/src/declaration.d.ts`
**Ação**: Adicionar tipo

```typescript
modSwitchProton: (gameId: string, protonPath: string) => Promise<{
  ok: boolean;
  data?: { newProtonPath: string; prefixPath: string; savesRestored: number; dllsInstalled: string[] };
  error?: string;
}>;
```

---

## Fase 3: UI — Integrar no GameConfigPanel

### Arquivo a modificar

#### 3.1 `tools/Mods_manager/ui/components/GameConfigPanel/GameConfigPanel.tsx`
**Ação**: Adicionar seção "Trocar Proton" com botão que abre o seletor

Mudanças:
1. Adicionar props: `onSwitchProton: (protonPath: string) => void`
2. Adicionar estado: `switchingProton`, `switchResult`
3. Na seção "Proton version (path)" — adicionar botão "Trocar Proton"
4. Quando clicado, abre o `ProtonRecommendationModal` (já existe)
5. Ao selecionar novo Proton, chama `onSwitchProton(novoProtonPath)`

```tsx
// Na seção Proton do GameConfigPanel:
<div className="mod-manager__config-section">
  <label>Proton</label>
  <label>Prefix path</label>
  <div className="mod-manager__config-row">
    <input value={configPrefixPath} onChange={...} />
    <button onClick={...}>Browse</button>
  </div>
  <label>Proton version (path)</label>
  <div className="mod-manager__config-row">
    <input value={configProtonPath} onChange={...} />
    <button onClick={onOpenProtonSelector}>Selecionar...</button>
  </div>
  {configProtonPath && configProtonPath !== originalProtonPath && (
    <div className="mod-manager__config-switch-proton">
      <p>⚠️ O prefixo será recriado com o novo Proton. Saves serão preservados.</p>
      <Button
        theme="primary"
        onClick={handleSwitchProton}
        disabled={switchingProton}
      >
        {switchingProton ? "Trocando Proton..." : "Trocar Proton"}
      </Button>
      {switchResult && (
        <p className={switchResult.ok ? "--ok" : "--error"}>
          {switchResult.ok ? "✅ Proton trocado com sucesso!" : `❌ ${switchResult.error}`}
        </p>
      )}
    </div>
  )}
</div>
```

#### 3.2 `tools/Mods_manager/ui/ModManager.tsx`
**Ação**: Passar `onSwitchProton` callback para `GameConfigPanel`

```tsx
const handleSwitchProton = async (newProtonPath: string) => {
  if (!selectedGame) return;
  const result = await window.electron.modSwitchProton(selectedGame, newProtonPath);
  // Atualizar estado do jogo se sucesso
  if (result.ok) {
    // Refresh config
    await refreshGameConfig(selectedGame);
  }
  return result;
};
```

---

## Fase 4: Integração com ProtonRecommendationModal

### Arquivo a modificar

#### 4.1 `data/install-api/proton_recommended/ui/proton-recommendation-modal.tsx`
**Ação**: Adicionar modo "switch" (selecionar para trocar, não para configurar inicialmente)

Mudanças:
1. Adicionar prop `mode: "configure" | "switch"` (default: "configure")
2. No modo "switch": botão "Trocar Proton" ao invés de "Configurar"
3. Emitir evento `onSwitch(protonPath)` ao invés de `onSelect(protonPath)`

### Fluxo completo do usuário

```
1. Usuário abre GameConfigPanel
2. Clica em "Trocar Proton"
3. ProtonRecommendationModal abre (modo "switch")
4. Seleciona novo Proton (ex: GE-Proton11-2)
   - Se não está baixado, baixa automaticamente
5. Clica em "Confirmar Troca"
6. Modal fecha, GameConfigPanel mostra:
   - "⚠️ Prefixo será recriado. Saves serão preservados."
   - Botão "Trocar Proton"
7. Usuário confirma
8. Progresso:
   - "🔍 Listando saves..."
   - "💾 Fazendo backup dos saves..."
   - "🗑 Removendo prefixo antigo..."
   - "⚙ Criando novo prefixo..."
   - "📦 Instalando DLLs..."
   - "📥 Restaurando saves..."
   - "✅ Proton trocado com sucesso!"
9. Config atualizada: protonVersion = novoProtonPath
```

---

## Fase 5: Validação e Edge Cases

### 5.1 Validações
- [ ] Verificar se novo Proton existe (`proton` binário)
- [ ] Verificar se prefixo não está em uso (jogo rodando)
- [ ] Verificar se há espaço em disco suficiente
- [ ] Verificar compatibilidade do Proton com o jogo

### 5.2 Edge Cases
- [ ] **Primeira vez**: Usuário nunca configurou Proton → fluxo normal
- [ ] **Mesmo Proton**: Usuário seleciona o mesmo Proton → mostrar "Nenhuma mudança"
- [ ] **Prefixo vazio**: Prefixo não existe ainda → criar direto (sem delete)
- [ ] **Backup falhou**: Saves não puderam ser copiados → avisar mas continuar
- [ ] **Criação falhou**: Novo prefixo não criou → restaurar backup do antigo
- [ ] **Jogo rodando**: Tentou trocar enquanto jogo está aberto → bloquear

### 5.3 Testes Manuais
1. Trocar GE-Proton11-1 → GE-Proton11-2 (Skyrim)
2. Trocar Proton → Wine vanilla ( Fallout 4)
3. Trocar e verificar que mods ainda funcionam
4. Trocar e verificar que saves foram preservados
5. Trocar e verificar que DLL overrides foram re-aplicados

---

## Resumo dos Arquivos

| Arquivo | Ação | Fase |
|---------|------|------|
| `tools/python-rpc/protonforge-api/api/handler.py` | Adicionar delete_prefix, clean_prefix, get_prefix_saves, restore_saves | 1 |
| `data/install-api/proton_recommended/python/api/handler.py` | Idem (manter sincronizado) | 1 |
| `tools/Mods_manager/events/mod-switch-proton.ts` | **NOVO** — handler IPC principal | 2 |
| `tools/Mods_manager/events/index.ts` | Importar mod-switch-proton.ts | 2 |
| `src/preload/index.ts` | Adicionar `modSwitchProton` ao bridge | 2 |
| `src/renderer/src/declaration.d.ts` | Adicionar tipo `modSwitchProton` | 2 |
| `tools/Mods_manager/ui/components/GameConfigPanel/GameConfigPanel.tsx` | Adicionar seção "Trocar Proton" | 3 |
| `tools/Mods_manager/ui/ModManager.tsx` | Passar callback `onSwitchProton` | 3 |
| `data/install-api/proton_recommended/ui/proton-recommendation-modal.tsx` | Adicionar modo "switch" | 4 |

## Dependências

### Externas (já presentes)
- `shutil` (Python stdlib) — delete_prefix, restore_saves
- `pathlib` (Python stdlib) — get_prefix_saves
- `node:child_process` (Electron) — backup temporário

### Internas (já existentes)
- `ProtonForgeRPC.call()` — comunicação com Python API
- `ModStorageService` — storage de config do jogo
- `gameDllCatalog` — DLLs e verbs por jogo
- `ProtonRecommendationModal` — seletor de Proton
- `logPlay()` — logging de operações

## Riscos

1. **Backup de saves pode falhar** — paths variam por jogo (mitigação: try/catch + aviso)
2. **Prefixo grande pode demorar para deletar** — mitigação: progress indicator
3. **Proton novo pode ter incompatibilidade** — mitigação: warn se tierScore < 50
4. **Race condition com jogo rodando** — mitigação: verificar se processo existe antes de deletar
