"""
Motor de recomendação de Proton para jogos.

Organização:
  core.py      → recommend(), get_available_forks()
  matching.py  → get_game_match(), get_fork_recommendations()
  options.py   → get_default_launch_options(), get_game_launch_options()
"""

from .core import recommend, get_available_forks

__all__ = ["recommend", "get_available_forks"]
