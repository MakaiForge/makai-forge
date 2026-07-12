# AGENTS.md — Módulo: Troca de Proton por Jogo

## Objetivo
Permitir ao usuário trocar a versão do Proton de um jogo específico, recriando o prefixo Wine preservando saves e configurações do usuário.

## Arquitetura Atual

### 3 Sistemas que usam Proton (diferentes contextos)

```
┌─────────────────────────────────────────────────────────┐
│                    Electron (Main)                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Mod Manager   │  │ ForgePipeline│  │ CompactFlow   │  │
│  │ (play 8-step) │  │ (launch umu) │  │ (install exe) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  │
│         │                  │                  │           │
│         ▼                  ▼                  ▼           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ ProtonForge  │  │ umu-run      │  │ subprocess    │  │
│  │ RPC Server   │  │ (binário)    │  │ (one-shot)    │  │
│  │ stdin/stdout │  │              │  │               │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                          │
│  ┌──────────────┐                                        │
│  │ Mod Bridge   │  ← ÚNICO que tem "context" tracking   │
│  │ (bridge.py)  │  ← {source, gameId, prefixPath}       │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

### Fluxo de Dados Atual

```
Mod Manager Play Pipeline:
  1. detectGame()     → lê de ModStorageService.game:{id}:config
  2. ensureProton()   → verifica se proton_path existe no disco
  3. ensurePrefix()   → cria prefixo se não existe
  4. applyGameConfigs → DLL overrides, winetricks, registry
  5. ensureSkse()     → download SKSE se necessário
  6. deployMods()     → symlinks no Data/
  7. launchGame()     → spawn proton/umu-run

Storage (JSON em ~/.config/makai-forger/):
  game:{gameId}:config = {
    gamePath: string,
    stagingDir: string,
    protonPrefix: string,     ← onde está o prefixo
    protonVersion: string     ← path do Proton escolhido
  }
```

### O que existe pronto (não exposto como RPC)

Em `tools/prefix/python/prefix/core.py`:
- `delete_prefix(prefix_path)` — shutil.rmtree (NÃO exposto)
- `clean_prefix(prefix_path)` — remove user.reg/system.reg (NÃO exposto)
- `prefix_exists(prefix_path)` — verifica user.reg + system.reg
- `is_prefix_initialized(prefix_path)` — verifica drive_c/windows/system32

### O que falta criar

1. **`switch_proton` RPC method** — backup saves → delete prefix → create → restore saves
2. **Context parameter** no handler dispatch (caller awareness)
3. **Wire-up no Mod Manager** — "Configurar Proton" chama switch_proton
4. **Validação** — verificar se novo Proton é compatível antes de trocar

## Arquivos Chave

### Python API (tools/python-rpc/protonforge-api/)
- `api/handler.py` — 11 métodos registrados (precisa adicionar: delete_prefix, clean_prefix, get_prefix_saves, restore_saves)
- `server.py` — JSON-RPC stdin/stdout, daemon threads, 120s timeout

### Python API NOVA (data/install-api/proton_recommended/python/)
- `api/handler.py` — 17 métodos (também precisa dos novos métodos)
- `server.py` — mesmos padrões

### Mod Manager IPC
- `tools/Mods_manager/events/mod-prefix-rpc.ts` — modCreatePrefix, modInstallGameDlls
- `tools/Mods_manager/events/mod-deploy.ts` — deployMods
- `tools/Mods_manager/events/mod-switch-proton.ts` — **NOVO** (não existe ainda)

### Mod Manager Play Pipeline
- `tools/Mods_manager/play/play-game.ts` — orquestrador 8-step
- `tools/Mods_manager/play/steps/03-prefix.ts` — cria prefixo via Python
- `tools/Mods_manager/play/steps/04-configs.ts` — DLL overrides + winetricks
- `tools/Mods_manager/play/steps/06-launch.ts` — spawn proton/umu

### UI
- `tools/Mods_manager/ui/components/GameConfigPanel/GameConfigPanel.tsx` — config do jogo (paths, prefix, health)
- `tools/Mods_manager/ui/components/ProtonConfigPanel/ProtonConfigPanel.tsx` — config simples de Proton
- `data/install-api/proton_recommended/ui/proton-recommendation-modal.tsx` — seletor de Proton completo (705 linhas)
- `tools/Mods_manager/ui/hooks/config/useProtonConfig.ts` — hook de estado do Proton

### Preload/Types
- `src/preload/index.ts` — bridge Electron↔Renderer (precisa adicionar modSwitchProton)
- `src/renderer/src/declaration.d.ts` — tipos IPC

## Plano de Implementação
Ver `docs/switch-proton/module.md` para detalhes completos das 5 fases.

## User Preferences
- Language: Portuguese (PT-BR)
- Projeto principal: Makai Forge (Electron + React + TypeScript + Python Bridge)
- Usuário tem 3 projetos: Makai Forge, XVK-Forge, MusicForge
