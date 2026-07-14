"""
core/engine/launch.py — Lançamento do jogo via Proton/umu-run.

Gerencia o spawn do processo do jogo, monitoramento,
e limpeza de processos órfãos.
"""

import os
import subprocess
import signal
import time


def launch_game(
    game_path: str,
    exe_path: str,
    prefix_path: str,
    proton_path: str,
    steam_app_id: str | None = None,
    env_overrides: dict | None = None,
) -> dict:
    """
    Lança o jogo usando umu-run ou Proton.

    Args:
        game_path: Caminho do jogo (STEAM_COMPAT_DATA_PATH parent)
        exe_path: Caminho do executável relativo (ex: "SkyrimSE.exe")
        prefix_path: Caminho do wrapper de prefixo
        proton_path: Caminho do Proton
        steam_app_id: Steam AppID
        env_overrides: Variáveis de ambiente extras

    Returns:
        dict com pid, method, success
    """
    env = os.environ.copy()
    env["STEAM_COMPAT_DATA_PATH"] = prefix_path
    env["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = os.path.expanduser("~/.steam/steam")

    # Garante steam_app_id informacional (para configs de prefixo)
    if steam_app_id:
        env["SteamAppId"] = steam_app_id

    # Monta caminho completo do executável
    # Tenta drive_c primeiro, depois caminho absoluto
    drive_c = os.path.join(prefix_path, "pfx", "drive_c")
    full_exe = os.path.join(drive_c, exe_path.lstrip("/"))

    if not os.path.exists(full_exe):
        full_exe = os.path.join(game_path, exe_path)

    if not os.path.exists(full_exe):
        return {"success": False, "error": f"Executável não encontrado: {full_exe}", "method": None}

    if env_overrides:
        env.update(env_overrides)

    # Tenta umu-run primeiro
    umu = _find_umu()
    if umu:
        try:
            env_umu = env.copy()
            if steam_app_id:
                env_umu["GAMEID"] = steam_app_id
                env_umu["STORE"] = "steam"
            proc = subprocess.Popen(
                [umu, "run", full_exe],
                env=env_umu,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return {"success": True, "pid": proc.pid, "method": "umu-run"}
        except FileNotFoundError:
            pass
        except Exception as e:
            return {"success": False, "error": f"umu-run error: {e}", "method": "umu-run"}

    # Fallback: Proton run
    if proton_path and os.path.isfile(proton_path):
        try:
            env_proton = env.copy()
            if steam_app_id:
                env_proton["STEAM_COMPAT_APPID"] = steam_app_id
            proc = subprocess.Popen(
                [proton_path, "run", full_exe],
                env=env_proton,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return {"success": True, "pid": proc.pid, "method": "proton"}
        except FileNotFoundError as e:
            return {"success": False, "error": str(e), "method": "proton"}

    return {"success": False, "error": "No launch method available", "method": None}


def kill_game(pid: int | None = None, game_id: str | None = None) -> bool:
    """Mata o processo do jogo e wineservers órfãos."""
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
            time.sleep(2)
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        except ProcessLookupError:
            pass

    # Mata wineservers órfãos
    kill_stale_wineserver()
    return True


def kill_stale_wineserver():
    """Mata processos wineserver que possam ter travado."""
    try:
        subprocess.run(
            ["pkill", "-9", "wineserver"],
            timeout=5,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


def _find_umu() -> str | None:
    """Localiza umu-run."""
    candidates = [
        "umu-run",
        "/usr/bin/umu-run",
        "/usr/local/bin/umu-run",
        os.path.expanduser("~/.local/bin/umu-run"),
        os.path.expanduser("~/.cargo/bin/umu-run"),
        os.path.expanduser("~/Documentos/Makai-forge/tools/prefix/umu-run"),
    ]
    import shutil
    for c in candidates:
        path = shutil.which(c) or c if os.path.isfile(c) else None
        if path:
            return path
    # Tenta python -m umu
    try:
        r = subprocess.run(["python3", "-m", "umu", "--help"], capture_output=True, timeout=5)
        if r.returncode == 0:
            return "python3 -m umu"
    except Exception:
        pass
    return None
