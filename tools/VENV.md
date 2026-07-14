# Venv — Documentacao Completa

> Ambiente virtual Python 3.10 para subsystemas Python. Caminho base: `tools/venv/`

---

## Estrutura

```
venv/
├── bin/                          # python3, python, pip, activate, etc.
├── include/
├── lib/
│   └── python3.10/
│       └── site-packages/
│           ├── aiohttp/          # HTTP async (torrent RPC)
│           ├── yarl/             # URL library
│           ├── multidict/        # Dict multivalor
│           ├── frozenlist/       # Lista imutavel
│           ├── aiosignal/        # Sinais async
│           ├── attrs/            # Utilitarios de classe
│           ├── pytest/           # Test runner
│           ├── pygments/         # Syntax highlighting
│           ├── msgpack/          # Serializacao binaria
│           ├── ijson/            # JSON incremental
│           ├── setuptools/       # Gerenciamento de pacotes
│           ├── pip/              # Instalador
│           └── [+ modulos stdlib Python 3.10]
├── lib/Tix8.4.3/                # Extensoes Tk
└── share/terminfo/              # Dados de terminal
```

---

## Pacotes Instalados

| Pacote | Versao | Usado por |
|--------|--------|-----------|
| aiohttp | 3.14.1 | python_rpc/ — HTTP async para qBittorrent API |
| yarl | 1.24.2 | python_rpc/ — Manipulacao URL |
| multidict | 6.7.1 | Dependencia aiohttp |
| frozenlist | 1.8.0 | Dependencia aiohttp |
| aiosignal | 1.4.0 | Dependencia aiohttp |
| attrs | 26.1.0 | Utilitarios gerais |
| msgpack | 1.2.1 | Serializacao binaria (torrent RPC) |
| ijson | 3.5.0 | Parsing JSON incremental (futuro: matched.json 1.5GB+) |
| pytest | 9.1.1 | Testes da API (test_prefix.py, test_recommendation.py) |
| pygments | latest | Syntax highlighting |
| setuptools | 70.3.0 | Gerenciamento pacotes |

---

## Como se Encaixa no Makai Forge

**Runtime Python** para `python-rpc/protonforge-api` e o torrent downloader `python_rpc`. Ativado quando o Electron spawna o servidor RPC. O `protonforge-api` usa zero pacotes externos (stdlib only), mas o `python_rpc` precisa de `aiohttp` e pacotes async. O venv tambem contem `pytest` para a suita de testes da API.
