import os
import subprocess
import signal
import time


def _find_steam() -> str | None:
    import shutil
    candidates = [
        "steam",
        "/usr/bin/steam",
        "/usr/games/steam",
        os.path.expanduser("~/.local/share/Steam/ubuntu12_32/steam"),
        os.path.expanduser("~/.steam/steam/ubuntu12_32/steam"),
    ]
    for c in candidates:
        path = shutil.which(c) or (c if os.path.isfile(c) else None)
        if path:
            return path
    return None


def _find_umu() -> str | None:
    import shutil
    candidates = [
        "umu-run",
        "umu",
        os.path.expanduser("~/.local/bin/umu-run"),
        "/usr/bin/umu-run",
    ]
    for c in candidates:
        path = shutil.which(c) or (c if os.path.isfile(c) else None)
        if path:
            return path
    return None


def _find_xdg_open() -> str | None:
    import shutil
    return shutil.which("xdg-open") or None


def launch_game(
    game_path: str,
    exe_path: str,
    prefix_path: str,
    proton_path: str,
    steam_app_id: str | None = None,
    env_overrides: dict | None = None,
    prefer_custom_prefix: bool = False,
) -> dict:
    full_exe = os.path.join(game_path, exe_path)

    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)

    if steam_app_id:
        env.setdefault("SteamAppId", steam_app_id)

    if prefer_custom_prefix:
        return _launch_with_proton(full_exe, prefix_path, proton_path, steam_app_id, env)

    if steam_app_id:
        url = f"steam://rungameid/{steam_app_id}"
        steam = _find_steam()
        if steam:
            try:
                proc = subprocess.Popen(
                    [steam, url],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                return {"success": True, "pid": proc.pid, "method": "steam"}
            except FileNotFoundError:
                pass

        xdg = _find_xdg_open()
        if xdg:
            try:
                proc = subprocess.Popen(
                    [xdg, url],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                return {"success": True, "pid": proc.pid, "method": "steam"}
            except FileNotFoundError:
                pass

    return _launch_with_proton(full_exe, prefix_path, proton_path, steam_app_id, env)


def _launch_with_proton(
    full_exe: str,
    prefix_path: str,
    proton_path: str,
    steam_app_id: str | None,
    env: dict,
) -> dict:
    env["WINEPREFIX"] = os.path.expanduser(prefix_path)
    env.setdefault("WINEDLLPATH", os.path.join(os.path.dirname(proton_path), "files", "lib", "wine"))

    expanded_proton = os.path.expanduser(proton_path)
    proton_dir = os.path.dirname(os.path.dirname(expanded_proton))

    if expanded_proton.endswith("proton"):
        proton_dir = os.path.dirname(os.path.dirname(expanded_proton))

    if proton_dir and os.path.isdir(proton_dir):
        env["PROTONPATH"] = proton_dir

    umu = _find_umu()
    if umu:
        try:
            proc = subprocess.Popen(
                [umu, full_exe],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return {"success": True, "pid": proc.pid, "method": "umu"}
        except FileNotFoundError:
            pass

    try:
        proc = subprocess.Popen(
            [expanded_proton, "run", full_exe],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return {"success": True, "pid": proc.pid, "method": "proton"}
    except FileNotFoundError:
        pass

    return {"success": False, "error": "Nenhum método de launch disponível", "method": None}


def kill_game(pid: int | None = None, game_id: str | None = None) -> bool:
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
    kill_stale_wineserver()
    return True


def kill_stale_wineserver():
    try:
        subprocess.run(
            ["pkill", "-9", "wineserver"],
            timeout=5,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
