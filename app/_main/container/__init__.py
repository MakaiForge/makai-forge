"""
app/_main/container/ — Container + Wine prefix orchestration (high-level).

ATENÇÃO: dois níveis de "container" no código:
  1. app/_main/container/                     ← este diretório (orquestração: IPC, venv, prefix UI)
  2. app/_main/container/makai_time/engine/container/  ← builder.py, steps/ (montagem bwrap)

- Nível 2 constrói os argumentos do bubblewrap (isolation, mounts, GPU, etc.).
- Nível 1 chama o nível 2 via subprocess (engine/cli.py) e gerencia o ciclo de vida.
- Ambos são interdependentes — nível 1 usa o nível 2 como executor.
"""
