from dataclasses import dataclass, field
from typing import Any


@dataclass
class StepResult:
    """Resultado de um step de construção do container.

    Cada step em steps/*.py retorna um StepResult com:
    - args: argumentos bwrap gerados
    - applied: True se o step fez alguma modificação
    - summary: descrição do que foi feito (para log)
    - extra: dict para passar dados entre steps (ex: gpu_info, mounts_extra)
    """
    args: list[str] = field(default_factory=list)
    applied: bool = False
    summary: str = ""
    extra: dict[str, Any] = field(default_factory=dict)
