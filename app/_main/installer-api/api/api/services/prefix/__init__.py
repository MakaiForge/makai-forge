"""
Módulo de gerenciamento de prefixos Wine/Proton.

Módulos:
    scanner   — Escaneia prefixo e detecta componentes instalados
    health    — Compara scanner com knowledge base, gera relatório
    resolver  — Resolve dependências e conflitos
    verifier  — Verifica instalação pós-componente
"""

from . import scanner
from . import health
from . import resolver
from . import verifier

__all__ = ["scanner", "health", "resolver", "verifier"]
