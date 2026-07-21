"""
engine/container/ — Low-level bwrap container construction.

ATENÇÃO: este é o submódulo que MONTA os argumentos do bubblewrap (builder.py, steps/).
Ele NÃO é a orquestração de alto nível — essa está em app/_main/container/
(index.ts, events/, wine_prefix/, core/venv.ts).

Relação:
  app/_main/container/                     ← orquestração (vida útil, IPC, prefix UI)
  app/_main/container/makai_time/engine/   ← runner Python (cli.py, shim.py, core/)
  app/_main/container/makai_time/engine/container/  ← ★ este: montagem bwrap
"""

from engine.container.builder import Builder, build_bwrap_cmd
from engine.container.capsule import GPUManifest, capture_gpu_libs, get_bwrap_overrides_args
from engine.container.steps import StepResult

__all__ = ["Builder", "StepResult", "build_bwrap_cmd", "GPUManifest", "capture_gpu_libs", "get_bwrap_overrides_args"]
