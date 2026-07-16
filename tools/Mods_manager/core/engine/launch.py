import os
import subprocess
import signal
import time


_ENV_PASSTHROUGH = [
    "SteamAppId", "GAMEID", "STORE", "PROTONPATH", "WINEDLLPATH",
    "DXVK_ENABLE", "DXVK_ASYNC", "DXVK_STATE_CACHE",
    "WINEESYNC", "WINEFSYNC",
    "PROTON_EAC_ENABLE", "PROTON_BATTLEYE_ENABLE",
]

MANAGED_RUNTIME_DIR = os.path.expanduser("~/.local/share/makaiforge/steamrt4")


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

    # Makai Time — único método de execução
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
