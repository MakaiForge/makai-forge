"""
ProtonForge API — módulo principal.

Pacote com a lógica de recomendação de Proton, gerenciamento de
prefixos Wine, catálogo de DLLs e montagem de launch arguments.

Organização:
  db/          → Conexões SQLite (catalogo.db, proton_data.db)
  services/    → Lógica de negócio (recomendação, gacha, anti-cheat, etc)
  handlers/    → Handlers RPC (registrados via @register em handler.py)

A API se comunica com o Electron via JSON-RPC sobre stdin/stdout,
seguindo o mesmo padrão do python_rpc/main.py existente.
"""

__version__ = "1.0.0"

# Re-export das funções principais pra compatibilidade com testes
from .services.recommendation import recommend, get_available_forks  # noqa: F401, E402
from .services.catalog import get_game_info, search_games  # noqa: F401, E402
from .services.prefix import scanner, health, resolver, verifier  # noqa: F401, E402
from .services.dlls import get_all_dlls, get_recommended_dlls, get_winetricks_command  # noqa: F401, E402
from .services.launch_args import build_launch_command, list_available_args, get_game_specific_tips  # noqa: F401, E402
from .services.proton_versions import get_installed_protons, validate_proton_path  # noqa: F401, E402
