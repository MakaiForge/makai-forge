"""game_install_core — módulo único e à parte para instalação de jogos.

Todas as funções que verificam se um jogo é instalador ou executável,
copiam para o prefixo (com verificação SHA256) e escaneiam os executáveis
vivem AQUI — usadas pela aba Download, aba Games, repair, setup-game e
pelo CompactFlow (via server.py / RPC).

API pública:
    detect_installer_type(source_path)      → instalador ou executável?
    copy_to_prefix(source, prefix)          → cópia verificada (temp+hash+swap)
    scan_prefix_for_exes(prefix, folder)    → scan DENTRO do prefixo
    snapshot_prefix(prefix)                 → estado do prefixo (instalador)
    find_new_executables(before, after)     → exe novos após instalador
    install_game(source, prefix, proton)    → fluxo completo (um único ponto)
    run_installer_in_container(...)         → executa instalador (env limpo)
"""

from .copy import copy_to_prefix
from .detect import detect_installer_type
from .orchestrator import install_game
from .runner import run_installer_in_container
from .scan import classify_exe, scan_prefix_for_exes
from .snapshot import find_new_executables, snapshot_prefix

__all__ = [
    "detect_installer_type",
    "copy_to_prefix",
    "scan_prefix_for_exes",
    "classify_exe",
    "snapshot_prefix",
    "find_new_executables",
    "run_installer_in_container",
    "install_game",
]
