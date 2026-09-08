"""game_install_core.runner — executa o instalador do jogo.

Executa o instalador via umu-run DIRETO (zipapp auto-contido — envolver com
python de venv quebra dentro do Steam Runtime com "Failed to import encodings")
com o env de "instalação limpa": desativa as funções extras do Proton
(DXVK, VKD3D, ESYNC, FSYNC, NVAPI) DURANTE o instalador — vídeos/previews de
instaladores quebram sob DXVK/syncs. O launch do jogo usa env normal.
"""

import os
import subprocess

INSTALL_CLEAN_ENV = {
    "PROTON_NO_ESYNC": "1",
    "PROTON_NO_FSYNC": "1",
    "WINEESYNC": "0",
    "WINEFSYNC": "0",
    "PROTON_USE_WINED3D": "1",
    "PROTON_DISABLE_DXVK": "1",
    "PROTON_DISABLE_NVAPI": "1",
    "PROTON_ENABLE_NVAPI": "0",
}


def _project_root() -> str:
    """Raiz do repositório (independente de __dirname de bundle)."""
    here = os.path.dirname(os.path.abspath(__file__))
    # game_install_core/ → services/ → Games/ → app/ → repo
    return os.path.abspath(os.path.join(here, "..", "..", "..", ".."))


def find_umu_binary() -> str | None:
    """Localiza o binário umu-run (env primeiro, depois _resources/binaries)."""
    candidates = [
        os.environ.get("MAKAI_UMU_BINARY"),
        os.path.join(_project_root(), "app", "_resources", "binaries", "umu-run"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None


def run_installer_in_container(installer_exe: str, proton_path: str,
                               prefix_path: str, game_path: str) -> dict:
    """Executa instalador via umu-run e aguarda exit.

    Returns: {"exitCode": int, "error"?: str}
    """
    expanded_proton = os.path.expanduser(proton_path)
    expanded_prefix = os.path.expanduser(prefix_path)

    umu_binary = find_umu_binary()
    if not umu_binary:
        return {"exitCode": -1,
                "error": "umu-run não encontrado (MAKAI_UMU_BINARY ou app/_resources/binaries/umu-run)"}

    clean_env = {
        **os.environ,
        "WINEPREFIX": expanded_prefix,
        "PROTONPATH": expanded_proton,
        **INSTALL_CLEAN_ENV,
    }
    # PYTHONHOME/PYTHONPATH poluem o python embutido do umu dentro do
    # Steam Runtime — remover antes de spawnar.
    for var in ("PYTHONHOME", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONOPTIMIZE"):
        clean_env.pop(var, None)

    try:
        proc = subprocess.Popen(
            [umu_binary, installer_exe],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            env=clean_env,
        )
        exit_code = proc.wait()
        return {"exitCode": exit_code}
    except FileNotFoundError:
        return {"exitCode": -1, "error": "umu-run not found"}
    except Exception as exc:
        return {"exitCode": -1, "error": str(exc)}
