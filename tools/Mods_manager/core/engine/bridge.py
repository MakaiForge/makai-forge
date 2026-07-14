"""
core/bridge.py — Bridge do prefixo para a Steam.

Cria symlink do prefixo customizado em compatdata/{appId}/pfx
e atualiza o config.vdf da Steam.
"""

import os
import shutil
import subprocess
import time


STEAM_CONFIG_PATH = os.path.expanduser("~/.steam/root/config/config.vdf")


def bridge_prefix_to_steam(
    game_id: str,
    custom_prefix_path: str,
    steam_app_id: str,
    proton_name: str | None = None,
) -> dict:
    """
    Cria symlink do prefixo customizado para compatdata da Steam.

    Isso permite que o Steam use o mesmo prefixo que o app.

    Args:
        game_id: ID do jogo
        custom_prefix_path: Caminho do wrapper (~/Games/Prefix/{game_id}/)
        steam_app_id: Steam AppID
        proton_name: Nome do Proton (ex: "GE-Proton9-12")

    Returns:
        dict com success, symlinkCreated, configUpdated
    """
    result = {"success": False, "symlinkCreated": False, "configUpdated": False}

    # Encontra a Steam library que contém (ou conterá) o compatdata
    compatdata_dir = _find_or_create_compatdata(steam_app_id)
    if not compatdata_dir:
        result["error"] = "No Steam library found"
        return result

    pfx_path = os.path.join(compatdata_dir, "pfx")
    resolved_custom = os.path.realpath(custom_prefix_path)

    # Segurança: prevenir symlink circular
    if os.path.realpath(pfx_path) == resolved_custom:
        result["error"] = "Circular symlink prevented"
        return result

    # Cria/atualiza symlink
    if os.path.exists(pfx_path):
        if os.path.islink(pfx_path):
            target = os.readlink(pfx_path)
            if os.path.realpath(target) == resolved_custom:
                result["symlinkCreated"] = True
            else:
                os.unlink(pfx_path)
                os.symlink(resolved_custom, pfx_path)
                result["symlinkCreated"] = True
        else:
            # Backup do pfx real e substitui por symlink
            backup = pfx_path + f".bak.{int(time.time())}"
            shutil.move(pfx_path, backup)
            os.symlink(resolved_custom, pfx_path)
            result["symlinkCreated"] = True
    else:
        os.symlink(resolved_custom, pfx_path)
        result["symlinkCreated"] = True

    result["success"] = True
    return result


def _find_or_create_compatdata(steam_app_id: str) -> str | None:
    """Encontra ou cria o diretório compatdata/{appId}."""
    libraries = _find_all_steam_libraries()
    for lib in libraries:
        compatdata = os.path.join(lib, "compatdata")
        if os.path.exists(os.path.dirname(compatdata)):
            app_dir = os.path.join(compatdata, steam_app_id)
            os.makedirs(app_dir, exist_ok=True)
            return app_dir
    return None


def _find_all_steam_libraries() -> list[str]:
    """Retorna todas as Steam libraries."""
    base = os.path.expanduser("~/.steam/steam")
    libraries = [os.path.join(base, "steamapps")]

    lf = os.path.join(base, "steamapps", "libraryfolders.vdf")
    if os.path.exists(lf):
        try:
            with open(lf) as f:
                for line in f:
                    line = line.strip()
                    if '"' in line and line.count('"') >= 4:
                        parts = line.split('"')
                        path_candidate = parts[-2]
                        if os.path.isdir(path_candidate):
                            libraries.append(os.path.join(path_candidate, "steamapps"))
        except OSError:
            pass

    return list(set(libraries))
