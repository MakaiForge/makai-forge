# Checklist de Dependências

## Python (app/_venv/)

### Instalado
| Pacote | Versão | Para quê |
|--------|--------|----------|
| aiohttp | 3.14.1 | Servidor HTTP do `server.py` |
| ijson | 3.5.0 | Parse incremental de matched.json (1.5GB+) |
| aiohappyeyeballs | 2.6.2 | Dependência aiohttp |
| aiosignal | 1.4.0 | Dependência aiohttp |
| yarl | 1.24.2 | Dependência aiohttp |
| attrs / frozenlist / multidict / propcache | várias | Dependências aiohttp |
| python 3.10.11 | — | Runtime |

### Não instalado (mas necessário no futuro)
| Pacote | Para quê | Prioridade |
|--------|----------|-----------|
| psutil | Monitoramento de processos (deploy longo) | Baixa |
| numpy | Otimização de matching de hardware | Baixa |

### O venv NÃO precisa
- uvicorn/fastapi/flask — server.py usa aiohttp diretamente via stdin/stdout
- ORMs — sqlite3 é built-in
- playwright — scraping ProtonDB foi descartado

---

## Node.js (projeto Electron)

| Dependência | Versão (package.json) | Para quê |
|------------|----------------------|----------|
| electron | ~28 ou ~29 | Runtime desktop |
| react / react-dom | ~18 | UI |
| vite | ~5 | Bundler |
| sass | ~1.70 | SCSS → CSS |
| typescript | ~5.3 | Type checking |
| @primer/octicons-react | ~19 | Ícones |
| electron-builder | ~24 | Build distribuição |

Todas no `package.json`. Rodar `npm install` se faltar algo.

---

## Sistema (Linux)

### Obrigatório
| Ferramenta | Para quê | Como verificar |
|-----------|----------|---------------|
| `p7zip` (7z) | Extrair mods .7z | `which 7z` |
| `unzip` | Extrair mods .zip | `which unzip` |
| `Steam` instalado | Detectar jogos + Proton | `which steam` |
| `umu-run` | Executar jogos com Proton | `which umu-run` |

### Opcional
| Ferramenta | Para quê |
|-----------|----------|
| `winetricks` | Instalar DLLs em prefixos |
| `gamescope` | Micro-compositor para jogos |
| `mangohud` | Overlay de performance |

---

## steam_finder.py

**Local:** `src/python/protonforge-api/bridge/Utils/steam_finder.py`

**Dependências:** Nenhuma (stdlib only: `re`, `pathlib`)

**O que escaneia:**
- `~/.steam/steam/config/libraryfolders.vdf`
- `~/.local/share/Steam/config/libraryfolders.vdf`
- `~/snap/steam/common/.local/share/Steam/config/libraryfolders.vdf`
- `/var/lib/flatpak/app/com.valvesoftware.Steam/.../libraryfolders.vdf`

**Funções exportadas:**
- `find_steam_libraries() → list[Path]` — retorna paths das steam libraries
- `find_game_by_steam_id(libraries, steam_id, exe_name) → Path | None` — encontra executável do jogo
- `find_steam_steamapps_dirs(libraries) → list[Path]`
- `find_game_installdir(libraries, steam_id) → str | None`
