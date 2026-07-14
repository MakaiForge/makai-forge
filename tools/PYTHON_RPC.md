# Python RPC — Documentacao Completa

> Servidor de recomendacao Proton + RPC legado de torrent. Caminho base: `tools/python-rpc/`

---

## Estrutura de Diretorios

```
python-rpc/
├── python_rpc/                   # RPC legado de torrent (qBittorrent)
│   ├── main.py                   # Bridge qBittorrent (445 linhas)
│   ├── qbittorrent_client.py     # Wrapper API qBittorrent
│   ├── requirements.txt          # aiohttp, yarl, attrs, etc.
│   ├── setup.py                  # cx_Freeze build Windows .exe
│   └── torrent_downloader.py.bak # Backup codigo antigo
│
└── protonforge-api/              # Servidor RPC principal
    ├── server.py                 # Entry point JSON-RPC stdio (212 linhas)
    ├── requirements.txt          # Zero deps (stdlib only)
    ├── activity.log              # Audit log
    ├── log.txt                   # Runtime log
    ├── scripts/
    │   └── migrate_to_sqlite.py  # Migracao de dados
    ├── tests/
    │   ├── test_prefix.py
    │   └── test_recommendation.py
    └── api/
        ├── __init__.py
        ├── handler.py            # Dispatch de metodos RPC (412 linhas)
        ├── audit.py              # Audit NDJSON estruturado (109 linhas)
        ├── db/
        │   ├── __init__.py
        │   └── connection.py     # Conexao SQLite
        └── services/
            ├── __init__.py
            ├── recommendation/
            │   ├── __init__.py
            │   ├── core.py       # Motor de recomendacao principal (243 linhas)
            │   ├── matching.py   # Queries DB game_match + fork_recommendations
            │   └── options.py    # Gerador de opcoes de launch
            ├── prefix/
            │   ├── __init__.py   # Re-exports de tools/prefix/python/
            │   ├── core.py       # Re-exports
            │   └── winetricks.py # Re-exports makaitricks
            ├── dlls.py           # Catalogo e recomendacoes DLL (186 linhas)
            ├── anticheat.py      # Deteccao EAC/BattlEye (41 linhas)
            ├── catalog.py        # Queries SQLite catalogo (68 linhas)
            ├── data.py           # Cache JSON (32 linhas)
            ├── gacha.py          # Handling especial gacha (74 linhas)
            ├── proton_versions.py # Scanner de Protons instalados (146 linhas)
            ├── launch_args/
            │   ├── __init__.py
            │   ├── core.py       # Construtor de comando launch (128 linhas)
            │   └── catalog.py    # Catalogo de args
            ├── compatflow_bridge.py  # Bridge analisador EXE (95 linhas)
            └── compatflow_analyzer/
                ├── __init__.py
                ├── analyzer.py   # Analise compatibilidade EXE (47 linhas)
                └── database.py   # Apps nativos, nomes de jogos, portas
```

---

## Arvore Genealogica de Execucao

### Servidor RPC (stdio JSON)

```
Electron main process
  → spawn python3 server.py (stdin/stdout)
    → server.py: JSON-RPC over Line-Delimited JSON
      → api/handler.py: dispatch(method, params)
        ├── recommend_proton(game_id)
        ├── get_game_info(game_id)
        ├── search_games(query)
        ├── create_prefix(game_id, proton_path, ...)
        ├── get_recommended_dlls(game_id)
        ├── install_game_dlls(game_id, prefix_path, proton_path)
        ├── get_launch_command(game_id, ...)
        ├── get_installed_protons()
        ├── analyze_exe(exe_path)
        ├── list_available_forks()
        ├── check_anticheat(game_id)
        ├── delete_prefix(prefix_path)
        ├── clean_prefix(prefix_path)
        ├── get_prefix_saves(prefix_path)
        └── restore_saves(prefix_path, saves_backup, backup_source)
```

### Motor de Recomendacao (o "cerebro")

```
recommend_proton(game_id)
  → services/recommendation/core.py: recommend()
    │
    ├── 1. game_match — match direto de matched.json
    │     └── Busca no SQLite com fork_recommendations
    │     └── Niveis de confianca por jogo
    │
    ├── 2. fork_recommendations — matching por similaridade
    │     └── Tabela fork_recommendations + dados anticheat
    │
    ├── 3. anticheat.json — EAC/BattlEye
    │     └── Sugerir forks compativel
    │
    ├── 4. gacha_navegador_chromium.json — jogos gacha
    │     └── +30 tierScore para DW-Proton, CachyOS, GE
    │     └── Genshin, Honkai, ZZZ, Wuthering Waves
    │
    └── 5. tierScore fallback — ranking generico
          └── Metadados de protons.json
```

---

## Metodos RPC Exportados (handler.py)

| Metodo | Descricao |
|--------|-----------|
| `recommend_proton(game_id)` | Recomendacao multi-tier |
| `get_game_info(game_id)` | Detalhes do jogo (252MB SQLite) |
| `search_games(query)` | Busca fuzzy LIKE + FTS |
| `create_prefix(game_id, proton_path, ...)` | Criar/configurar prefix Wine |
| `get_recommended_dlls(game_id)` | Recomendacoes DLL |
| `install_game_dlls(game_id, prefix_path, proton_path)` | Instalar DLLs via winetricks |
| `get_launch_command(game_id, prefix_path, proton_path, exe)` | Montar comando launch |
| `get_installed_protons()` | Scan 4 diretorios Proton |
| `analyze_exe(exe_path)` | Identificar .exe |
| `list_available_forks()` | Todos forks com tier scores |
| `check_anticheat(game_id)` | Detectar EAC/BattlEye |
| `delete_prefix(prefix_path)` | Remover prefix |
| `clean_prefix(prefix_path)` | Limpar prefix |
| `get_prefix_saves(prefix_path)` | Encontrar saves |
| `restore_saves(prefix_path, saves_backup, backup_source)` | Copiar saves |

---

## Servicos Internos

### dlls.py (186 linhas)
- Catalogo de DLLs recomendadas por jogo
- vcrun2022, d3dcompiler_47, mfplat, xact, d3dx9, dotnet48

### anticheat.py (41 linhas)
- Deteccao EasyAntiCheat / BattlEye

### catalog.py (68 linhas)
- Queries SQLite `catalogo.db` (~252MB)
- Tabela `games` + index FTS `games_fts`

### proton_versions.py (146 linhas)
- Scan 4 diretorios:
  - `~/.steam/steam/steamapps/common/` (Valve oficial)
  - `~/.steam/steam/compatibilitytools.d/` (GE, CachyOS, etc.)
  - `/usr/share/steam/compatibilitytools.d/` (sistema)
  - `~/.local/share/protonforge/compat-tools/compatibilitytools.d/` (API-managed)

### launch_args/core.py (128 linhas)
- Construtor de comando de launch com env vars

### compatflow_analyzer/analyzer.py (47 linhas)
- Analise de compatibilidade de .exe

### audit.py (109 linhas)
- Logs NDJSON estruturados: request/response/error/event/service_call

---

## python_rpc/ (Torrent RPC Legado)

### main.py (445 linhas)
- Bridge qBittorrent via API Web `/api/v2/`
- Metodos: status, seed_status, action (start/pause/cancel/resume_seeding/pause_seeding/set_download_limit)
- Validacao HMAC por senha
- Cache de arquivos torrent

### qbittorrent_client.py
- Wrapper HTTP para qBittorrent Web API

---

## Como se Encaixa no Makai Forge

O **cerebro** do sistema de compatibilidade Proton. O Electron spawna `server.py` como child process e comunica via stdin/stdout JSON-RPC. Toda pergunta "qual Proton usar para este jogo?" e respondida por este servidor Python. Combina dados da comunidade (ProtonDB, catalogs de forks), databases de anticheat, fixes de gacha, recomendacoes de DLL, e construcao de comandos de launch em um unico servico.
