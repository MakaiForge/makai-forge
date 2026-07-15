import os
import subprocess
import signal
import time


# Env vars do jogo que devem ser passadas para o Makai Time
_ENV_PASSTHROUGH = [
    "SteamAppId", "GAMEID", "STORE", "PROTONPATH", "WINEDLLPATH",
    "DXVK_ENABLE", "DXVK_ASYNC", "DXVK_STATE_CACHE",
    "WINEESYNC", "WINEFSYNC",
    "PROTON_EAC_ENABLE", "PROTON_BATTLEYE_ENABLE",
]


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
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "..", "tools", "prefix", "umu-run"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "..", "resources", "binaries", "umu-run"),
    ]
    for c in candidates:
        expanded = os.path.expanduser(c)
        path = shutil.which(c) or (expanded if os.path.isfile(expanded) else None)
        if path:
            return path
    return None


MANAGED_RUNTIME_DIR = os.path.expanduser("~/.local/share/makaiforge/steamrt4")


def _find_managed_runtime() -> str | None:
    entry = os.path.join(MANAGED_RUNTIME_DIR, "_v2-entry-point")
    if os.path.isfile(entry) and os.access(entry, os.X_OK):
        return MANAGED_RUNTIME_DIR
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
    if expanded_proton.endswith("proton"):
        proton_dir = os.path.dirname(expanded_proton)
    else:
        proton_dir = expanded_proton

    if proton_dir and os.path.isdir(proton_dir):
        env["PROTONPATH"] = proton_dir

    if steam_app_id:
        env.setdefault("GAMEID", f"umu-{steam_app_id}")
        env.setdefault("STORE", "steam")

    # Attempt 1: Makai Time (new container)
    try:
        import sys as _sys
        _prefix_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
            "prefix",
        )
        _cmd = [
            _sys.executable, "-m", "makai_time.makai_time",
            "--game-exe", full_exe,
            "--proton-path", expanded_proton,
            "--prefix-path", os.path.expanduser(prefix_path),
            "--game-path", os.path.dirname(full_exe),
            "--quiet",
        ]
        for _k in _ENV_PASSTHROUGH:
            if _k in env:
                _cmd.extend(["-e", f"{_k}={env[_k]}"])
        _proc = subprocess.Popen(
            _cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            cwd=_prefix_dir,
        )
        return {"success": True, "pid": _proc.pid, "method": "makai_time"}
    except (FileNotFoundError, ImportError):
        pass

    # Attempt 2: managed Steam Runtime + Proton
    runtime_dir = _find_managed_runtime()
    if runtime_dir:
        entry = os.path.join(runtime_dir, "_v2-entry-point")
        shim = os.path.join(runtime_dir, "umu-shim")
        try:
            proc = subprocess.Popen(
                [entry, "--verb=waitforexitandrun", "--", shim, expanded_proton, "waitforexitandrun", full_exe],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return {"success": True, "pid": proc.pid, "method": "steamrt"}
        except FileNotFoundError:
            pass

    # Attempt 3: external umu-run
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

    # Attempt 4: direct Proton
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
