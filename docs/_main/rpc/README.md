# Proton API — Documentação

> A documentação completa da API Python de recomendação de Proton está em:
>
> **[`protonforge-api/README.md`](../../protonforge-api/README.md)**

## O que faz

API Python que se comunica com o Electron via **JSON-RPC stdin/stdout**.
Responsável por:

- **Recomendação de Proton** para cada jogo (qual fork usar)
- **Criação de prefixo Wine** com DLLs e winetricks
- **Montagem de launch command** com env vars
- **Detecção de anti-cheat** e jogos gacha
- **Análise de executáveis** via CompatFlow

## Métodos RPC Principais

| Método | Descrição |
|--------|-----------|
| `recommend_proton(game_id)` | Retorna fork primário + alternativas + launch options |
| `create_prefix(game_id, proton_path, prefix_path)` | Cria/configura prefixo Wine |
| `get_recommended_dlls(game_id)` | DLLs recomendadas para o jogo |
| `get_launch_command(game_id, prefix, proton, exe)` | Monta comando de execução |
| `get_installed_protons()` | Lista Protons instalados no sistema |
| `analyze_exe(exe_path)` | Analisa .exe via CompatFlow |

## Fluxo

```
Electron → JSON-RPC → protonforge-api/server.py → handler.py → services/
                                                                    ├── recommendation/core.py
                                                                    ├── prefix/core.py
                                                                    ├── dlls.py
                                                                    ├── launch_args/core.py
                                                                    ├── anticheat.py
                                                                    ├── gacha.py
                                                                    └── compatflow_bridge.py
```

## Dados

- `app/_data/catalogo.db` (~252MB) — catálogo de jogos
- `app/_data/proton_data.db` (~280MB) — dados de compatibilidade
- `tools/plaina_proton/api proton/` — JSONs de matched, forks, launch args
