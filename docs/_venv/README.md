# Python Virtualenv

Virtualenv Python 3.10 isolado, gerenciado pelo bootstrap do app.

## Gerenciamento

- **Setup automático**: `_main/bootstrap/venv.ts` faz download do Python portátil e cria o venv na primeira execução
- **Path**: `app/_venv/bin/python3`
- **Dependências**: listadas em `dev/dependencias-python.md`

## Uso

```
app/_venv/bin/python3 server.py        # RPC server
app/_venv/bin/python3 -m makrun --help  # Makai Time CLI
```

## Integração

- `_main/rpc/base.py` — RPC server roda dentro do venv
- `_main/container/` — Makai Time engine usa Python do venv
- `_main/bootstrap/venv.ts` — cria/verifica o venv no startup
