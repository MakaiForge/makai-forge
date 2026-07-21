# Migração CSV/JSON → SQLite

## Resumo

Todo o catálogo de Protons foi migrado de planilhas CSV + arquivos JSON
para bancos SQLite. A API agora consulta SQLite por padrão, com fallback
transparente para JSON quando necessário.

## Bancos de Dados

### `app/_data/proton_data.db` (~280MB)

Dados de recomendação de Proton por jogo + metadados.

| Tabela | Linhas | Origem |
|--------|--------|--------|
| `game_matches` | 173.667 | `matched.json` — jogos Steam com Proton atribuído |
| `fork_recommendations` | 1.433.769 | `recommendations/*.json` — recomendações por similaridade HW |
| `proton_forks` | 10 | `protons.json` — metadados dos forks (tier, score) |
| `anticheat` | 75 | `anticheat.json` — jogos com anti-cheat |
| `mod_compat` | 59 | `mod_compat.json` — compatibilidade de mods |
| `dll_catalog` | 10 | `prefixo_dlls.json` — catálogo de DLLs |
| `dll_dependencies` | 24 | `prefixo_dlls.json` — grafo de dependências |
| `launch_catalog` | 68 | `launch_args.json` — argumentos de lançamento |
| `game_launch_tips` | 26 | `launch_args.json` — dicas por jogo |
| `gacha` | 6 | `gacha_navegador_chromium.json` — dados gacha |

### `app/_data/fork_catalog.db` (~2.6MB)

Catálogo bruto dos forks de Proton extraído dos CSVs.

| Tabela | Linhas | CSV de origem |
|--------|--------|---------------|
| `fork_overview` | 16 | `00_visao_geral.csv` |
| `fork_versions` | 302 | `01_todas_versoes.csv` |
| `dw_proton_detalhado` | 28 | `02_dw_proton_detalhado.csv` |
| `version_changelogs` | 530 | `03_todas_versoes_com_descricao.csv` |
| `catalogo_proton` | 530 | `CATALOGO_PROTON.csv` |
| `catalogo_proton_completo` | 530 | `CATALOGO_PROTON_COMPLETO.csv` |
| `fork_boxtron` | 18 | `04_boxtron.csv` |
| `fork_dw_proton` | 30 | `04_dw-proton.csv` |
| `fork_luxtorpeda` | 89 | `04_luxtorpeda.csv` |
| `fork_proton_cachyos` | 58 | `04_proton-cachyos.csv` |
| `fork_proton_em` | 38 | `04_proton-em.csv` |
| `fork_proton_ge_rtsp` | 32 | `04_proton-ge-rtsp.csv` |
| `fork_proton_ge` | 225 | `04_proton-ge.csv` |
| `fork_proton_tkg` | 39 | `04_proton-tkg.csv` |
| `fork_roberta` | 1 | `04_roberta.csv` |

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                    Fluxo de dados                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  CSVs (tools/plaina_proton/*.csv)                        │
│    │                                                     │
│    ├── import_csvs_to_sqlite.py ──→ fork_catalog.db       │
│    │                              (dados crus dos forks) │
│    │                                                     │
│    └── build-proton-api.py ──→ JSONs ──→ proton_data.db  │
│                    (api proton/)     (recomendações)      │
│                                          │               │
│  JSONs (api proton/*.json)               │               │
│    │                                     │               │
│    └── populate_metadata_tables.py ──────┘               │
│              (proton_forks, anticheat, etc)              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │               Runtime (server.py)                │    │
│  │                                                  │    │
│  │  _load_json() → tenta SQLite, fallback JSON      │    │
│  │  protonfix-service.ts → tenta SQLite, fallback   │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## Como Atualizar o Catálogo

```bash
# 1. Edite os CSVs em tools/plaina_proton/
#    (fork_overview, fork_versions, etc.)

# 2. Importe os CSVs atualizados pro SQLite
python tools/plaina_proton/import_csvs_to_sqlite.py

# 3. Reconstrua a API (gera JSONs + proton_data.db)
python scripts/helpers/build-proton-api.py
python protonforge-api/scripts/migrate_to_sqlite.py
python protonforge-api/scripts/populate_metadata_tables.py
```

## Scripts

| Script | Função |
|--------|--------|
| `tools/plaina_proton/import_csvs_to_sqlite.py` | Lê todos CSVs → `fork_catalog.db` |
| `protonforge-api/scripts/populate_metadata_tables.py` | Lê JSONs → `proton_data.db` (tabelas auxiliares) |
| `protonforge-api/scripts/migrate_to_sqlite.py` | Lê `matched.json` + `recommendations/*.json` → `proton_data.db` |
| `scripts/helpers/build-proton-api.py` | Gera toda a API a partir dos dados fonte |

## Performance

- `_load_json("protons.json")` — Antes: ler 172 linhas de JSON. Agora: `SELECT` em 10 linhas no SQLite.
- `_load_json("anticheat.json")` — Antes: ler JSON com 75 jogos. Agora: SQLite.
- `get_game_match()` — Já era SQLite (via `matching.py`).
- `fork_recommendations` — Já era SQLite (~1.4M linhas).

A leitura de JSON ainda existe como fallback. Se o SQLite falhar
(DB corrompido, tabela inexistente), o sistema volta automaticamente
para o arquivo JSON correspondente.

## Próximos Passos Possíveis

1. Migrar `app/_data/releases/*.json` para o SQLite
2. Adicionar tabela de benchmark de usuários (separada)
3. Unificar `catalogo.db` + `fork_catalog.db` + `proton_data.db`
