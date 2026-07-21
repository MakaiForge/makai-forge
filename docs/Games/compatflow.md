# Integração CompatFlow → ProtonForge

## Status: ✅ Implementado (parcial)

## Estrutura Criada

### `compatflow/` — Módulo standalone do CompatFlow

```
compatflow/
├── __init__.py              # Exporta analyze(), NATIVE, etc.
├── core/
│   ├── __init__.py
│   ├── database.py          # NATIVE dict (300+ apps) + GAME_NAMES (300+ jogos)
│   └── analyzer.py          # analyze(), get_app_name(), analyze_batch()
├── utils/
│   ├── __init__.py
│   └── system.py            # get_distro(), get_install_cmd(), check_installed()
├── assets/
│   └── compatflow.svg       # Logo
├── cli.py                   # CLI: python compatflow/cli.py --test <exe>
└── COMPATFLOW.md            # (futuro) Documentação completa do módulo
```

### `protonforge-api/api/services/compatflow_bridge.py` — Ponte API

Conecta o CompatFlow com o sistema RPC do ProtonForge. Função principal:

- `analyze_exe(exe_path)` → analisa o .exe, retorna tipo (app/_resources/native/port/game/unknown) + dados enriquecidos pro ProtonForge

### `protonforge-api/api/handler.py` — RPC registrado

- `analyze_exe` (RPC) → chama `compatflow_bridge.analyze_exe()`

### Electron (TypeScript)

- `src/main/services/proton-recommendation.ts` → método `analyzeExe(exePath)`
- `src/main/events/proton/analyze-game-exe.ts` → IPC handler `analyzeGameExe`
- `src/main/events/proton/index.ts` → registro
- `src/preload/index.ts` → bridge
- `src/renderer/src/declaration.d.ts` → tipos

## O que funciona

- `python3 compatflow/cli.py --test <exe>` → identifica jogos (Genshin Impact, etc.) e apps nativos (Discord, VLC, etc.)
- RPC `analyze_exe` na API Python
- IPC `analyzeGameExe` no Electron (chamado durante `openGameInstaller`)

## Testes

```
$ python3 compatflow/cli.py --test GenshinImpact_install_20250520.exe
→ type: game, app: Genshin Impact

$ python3 compatflow/cli.py --test DiscordSetup.exe
→ type: native, app: Discord, package: discord
```

## Próximos passos

- [ ] Corrigir bug do .exe único (Genshin): quando `gamePath` é um arquivo .exe, executar como instalador ao invés de `shell.showItemInFolder()`
- [ ] Mostrar resultado do CompatFlow na UI antes do modal de recomendação
- [ ] Se for native → sugerir instalação nativa
- [ ] Se for game → fluxo normal (modal → recomendação → download Proton → prefixo → DLLs → instalar)
- [ ] Se for unknown → fallback para fluxo genérico
- [ ] UI standalone PySide6 do CompatFlow (opcional)
