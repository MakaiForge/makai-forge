# ProtonForge API

API Python para gerenciamento inteligente de Proton, Wine prefixes e configuração de compatibilidade para jogos Windows no Linux.

## Visão Geral

Esta API resolve o problema de **qual Proton usar para cada jogo** e **como configurar o ambiente** (prefixo, DLLs, launch args) de forma automática ou assistida.

Ela se comunica com o Electron (frontend) via **JSON-RPC sobre stdin/stdout** — mesmo padrão usado pelo `python_rpc/main.py` existente.

## Arquitetura

```
Electron Main Process
    │
    ├── stdin/stdout JSON-RPC
    │
    ▼
protonforge-api
    │
    ├── server.py          ← Entry point: stdio JSON-RPC loop
    ├── api/
    │   ├── handler.py     ← Dispatch de métodos RPC
    │   ├── recommendation.py  ← Motor de recomendação (matched.json)
    │   ├── prefix.py      ← Criação/configuração de Wine prefix
    │   ├── dlls.py        ← Catálogo de DLLs + winetricks
    │   ├── launch_args.py ← Montagem de launch arguments
    │   └── proton_versions.py ← Gerenciamento de versões de Proton
    └── data/              ← Dados da API (JSON/SQLite)
```

## Métodos RPC

### `recommend_proton(game_id: str) → dict`

Retorna a recomendação de Proton para um jogo.

**Parâmetros:**
- `game_id` (string): Steam App ID ou identificador do jogo

**Resposta:**
```json
{
  "game_id": "1245620",
  "title": "ELDEN RING",
  "primary": {
    "fork": "ge-proton",
    "version": "GE-Proton10-28",
    "tier": "gold",
    "confidence": "high"
  },
  "alternatives": [
    {"fork": "valve", "version": "proton_experimental", "tier": "gold", "confidence": "medium"},
    {"fork": "proton-cachyos", "version": "latest", "tier": "silver", "confidence": "low"}
  ],
  "launch_options": {
    "env_vars": ["DXVK_ASYNC=1"],
    "dlls": ["d3dcompiler_47"],
    "winetricks": ["d3dcompiler_47", "vcrun2022"],
    "wine_overrides": "d3dcompiler_47=n,b"
  }
}
```

### `create_prefix(game_id: str, proton_path: str, prefix_path?: str, auto_dlls?: bool) → dict`

Cria ou configura um Wine prefix para o jogo.

**Parâmetros:**
- `game_id` (string): ID do jogo
- `proton_path` (string): Caminho para o Proton (ex: `~/.steam/steam/compatibilitytools.d/GE-Proton10-28`)
- `prefix_path` (string, opcional): Caminho do prefixo. Default: `~/games/proton-forger/<game_id>`
- `auto_dlls` (bool, opcional): Instala DLLs recomendadas automaticamente. Default: `true`

### `get_recommended_dlls(game_id: str) → dict`

Retorna lista de DLLs recomendadas para o jogo baseado no tipo/categoria.

### `get_launch_command(game_id: str, prefix_path: str, proton_path: str, executable: str) → dict`

Monta o comando de lançamento completo com todas as env vars e launch options.

### `get_installed_protons() → list`

Lista versões de Proton instaladas no sistema (Steam + compatibilitytools.d + API).

### `get_game_info(game_id: str) → dict`

Retorna informações do jogo do catálogo SQLite.

### `search_games(query: str) → list`

Busca jogos no catálogo por nome.

### `list_available_forks() → list`

Lista todos os forks de Proton disponíveis com seus tiers e features.

## Fluxo de Uso (Instalação Automática)

```
1. Usuário clica "Instalar" no jogo
2. Electron chama recommend_proton(game_id)
3. API consulta matched.json → recommendations/ → forks por tierScore → retorna melhor fork + versão
4. Electron mostra opções pro usuário (ou usa padrão)
5. Usuário confirma
6. Electron chama create_prefix(game_id, proton_path)
7. API cria prefixo em ~/games/proton-forger/<game_id>
8. API roda winetricks com DLLs recomendadas
9. API configura environment
10. Electron chama get_launch_command() → monta comando final
11. Electron executa via Umu.launchExecutable()
```

## Dados

### Fontes

| Fonte | Localização | Formato |
|-------|-------------|---------|
| Catálogo de jogos | `resources/catalogo.db` | SQLite |
| Recomendações matched | `api proton/matched.json` | JSON (1.7M jogos) |
| Forks de Proton | `api proton/protons.json` | JSON (10 forks) |
| DLLs e winetricks | `api proton/prefixo_dlls.json` | JSON |
| Launch args | `api proton/launch_args.json` | JSON (68 args) |
| Recomendações por fork | `api proton/recommendations/*.json` | JSON (10 arquivos) |

### SQLite vs JSON

O projeto usa **SQLite** para o catálogo principal (`catalogo.db` ~263MB) e **JSON** para os dados da API de Proton. A escolha é proposital:
- **SQLite**: catálogo de jogos com buscas textuais (FTS5) e consultas relacionais
- **JSON**: dados de recomendação que são carregados em memória (matched.json é append-only)

Para evitar corrupção: o SQLite usa WAL mode (`PRAGMA journal_mode=WAL`).

## Instalação

```bash
# Ativar o venv Python 3.10
source /home/cas/Documentos/protonforgerfull/venv/bin/activate

# Instalar dependências
cd /home/cas/Documentos/protonforgerfull/protonforge-api
pip install -r requirements.txt
```

## Uso

```bash
# Iniciar servidor RPC (modo stand-alone para testes)
python server.py

# Modo interativo (stdin/stdout) — usado pelo Electron
echo '{"id":1,"method":"recommend_proton","params":{"game_id":"1245620"}}' | python server.py
```

## Testes

```bash
pytest tests/ -v
```

## Estrutura dos Arquivos

```
protonforge-api/
├── README.md              ← Este arquivo
├── requirements.txt       ← Dependências Python
├── server.py              ← Entry point, stdio JSON-RPC loop
├── api/
│   ├── __init__.py
│   ├── handler.py         ← Dispatcher de métodos RPC
│   ├── recommendation.py  ← Motor de recomendação por jogo
│   ├── prefix.py          ← Criação/config de Wine prefix + winetricks
│   ├── dlls.py            ← Catálogo e instalação de DLLs
│   ├── launch_args.py     ← Montagem de launch command
│   └── proton_versions.py ← Detecção de versões de Proton instaladas
├── data/                  ← Symlinks para os dados da API
│   ├── api_proton/        → /home/cas/Documentos/plania proton aqui/api proton/
│   └── catalogo.db        → .../resources/catalogo.db
└── tests/
    ├── __init__.py
    ├── test_recommendation.py
    └── test_prefix.py
```

## Notas de Desenvolvimento

### Erros Comuns e Soluções

- **SQLite database is locked**: Ocorre se múltiplos processos acessam o mesmo `.db`. Solução: usar `timeout=5000` na conexão e `WAL` journal mode.
- **matched.json muito grande (1.5GB+)**: Não carregar inteiro em memória. Usar `ijson` para parse incremental ou dividir em chunks.
- **winetricks falha silenciosamente**: O winetricks não retorna exit code confiável. Solução: verificar se a DLL foi criada no prefixo após o comando.
- **Proton GE não tem toolmanifest.vdf**: Alguns forks não seguem o padrão Steam. Solução: detectar pela presença do binário `proton` no diretório.
