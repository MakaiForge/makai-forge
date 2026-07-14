"""
core/engine/prefix.py — Criação e validação de prefixo Wine/Proton.

Estratégias de criação:
1. umu-run → wineboot
2. Proton wineboot
3. Proton run wineboot
"""

import os
import subprocess
import shutil
from pathlib import Path

MAKAITRICKS_PATH = os.path.expanduser(
    "~/Documentos/Makai-forge/data/install-api/Makaitricks"
)


def default_prefix_dir(game_id: str) -> str:
    """Retorna o caminho padrão para o prefixo."""
    home = os.path.expanduser("~")
    return os.path.join(home, "Games", "Prefix", game_id)


def is_valid_prefix(prefix_path: str) -> bool:
    """Verifica se um prefixo Wine é válido."""
    required = [
        os.path.join(prefix_path, "pfx", "user.reg"),
        os.path.join(prefix_path, "pfx", "system.reg"),
        os.path.join(prefix_path, "pfx", "drive_c"),
        os.path.join(prefix_path, "pfx", "dosdevices"),
    ]
    for path in required:
        if not os.path.exists(path):
            return False
    return True


def create_prefix(
    prefix_path: str,
    proton_path: str,
    game_id: str,
    steam_app_id: str | None = None,
) -> dict:
    """
    Cria o prefixo Wine usando o Proton.

    Args:
        prefix_path: Caminho do wrapper (~/Games/Prefix/{game_id}/)
        proton_path: Caminho do binário Proton
        game_id: ID do jogo
        steam_app_id: Steam AppID

    Returns:
        dict com resultado
    """
    result = {"prefix_path": prefix_path, "created": False, "error": None}

    pfx_dir = os.path.join(prefix_path, "pfx")
    os.makedirs(pfx_dir, exist_ok=True)
    os.makedirs(os.path.join(pfx_dir, "drive_c"), exist_ok=True)

    env = os.environ.copy()
    env["STEAM_COMPAT_DATA_PATH"] = prefix_path
    if steam_app_id:
        env["STEAM_COMPAT_APPID"] = steam_app_id
        env["SteamAppId"] = steam_app_id

    # Tenta umu-run
    umu = _find_umu()
    if umu:
        try:
            subprocess.run(
                [umu, "wineboot", "-u"],
                env=env,
                timeout=30,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if is_valid_prefix(prefix_path):
                result["created"] = True
                return result
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    # Tenta Proton wineboot
    if proton_path and os.path.isfile(proton_path):
        proton_dir = os.path.dirname(proton_path)
        wineboot = os.path.join(proton_dir, "wineboot")
        if os.path.isfile(wineboot):
            try:
                subprocess.run(
                    [wineboot, "-u"],
                    env=env,
                    timeout=60,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                if is_valid_prefix(prefix_path):
                    result["created"] = True
                    return result
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass

        # Tenta 'proton run wineboot'
        try:
            subprocess.run(
                [proton_path, "run", "wineboot", "-u"],
                env=env,
                timeout=120,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if is_valid_prefix(prefix_path):
                result["created"] = True
                return result
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            result["error"] = str(e)

    if not result["created"]:
        result["error"] = result.get("error") or "Prefix creation failed, all strategies exhausted"

    return result


def delete_prefix(prefix_path: str) -> bool:
    """Remove o prefixo (pfx/) mantendo o wrapper."""
    pfx_path = os.path.join(prefix_path, "pfx")
    if os.path.exists(pfx_path):
        shutil.rmtree(pfx_path, ignore_errors=True)
        return not os.path.exists(pfx_path)
    return True


def _find_umu() -> str | None:
    """Localiza umu-run."""
    import shutil
    candidates = [
        "umu-run",
        "/usr/bin/umu-run",
        "/usr/local/bin/umu-run",
        os.path.expanduser("~/.local/bin/umu-run"),
        os.path.expanduser("~/.cargo/bin/umu-run"),
        os.path.expanduser("~/Documentos/Makai-forge/tools/prefix/umu-run"),
    ]
    for c in candidates:
        path = shutil.which(c)
        if path:
            return path
        if os.path.isfile(c):
            return c
    return None
