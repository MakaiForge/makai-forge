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
    game_id: str | None = None,
    env_overrides: dict | None = None,
    prefer_custom_prefix: bool = False,
) -> dict:
    full_exe = os.path.join(game_path, exe_path)

    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)

    if steam_app_id:
        env.setdefault("SteamAppId", steam_app_id)

    return _launch_with_proton(full_exe, prefix_path, proton_path, steam_app_id, env, game_id)


def _launch_with_proton(
    full_exe: str,
    prefix_path: str,
    proton_path: str,
    steam_app_id: str | None,
    env: dict,
    game_id: str | None = None,
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

    # Makai Runner — execução via makrun
    import sys as _sys
    _makrun_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
        "prefix", "makai_time",
    )
    _launch_env = env.copy()
    _launch_env["WINEPREFIX"] = os.path.expanduser(prefix_path)
    _launch_env["PROTONPATH"] = expanded_proton
    _launch_env.pop("PYTHONHOME", None)
    _launch_env.pop("PYTHONPATH", None)
    if game_id:
        _launch_env["GAMEID"] = game_id

    _cmd = [
        "python3", "-m", "makrun",
        "waitforexitandrun", full_exe,
    ]

    _log_path = os.path.expanduser("~/.cache/makrun-launch.log")
    _log_dir = os.path.dirname(_log_path)
    os.makedirs(_log_dir, exist_ok=True)
    _stderr_fd = open(_log_path, "a")
    _stderr_fd.write(f"\n{'='*60}\n")
    _stderr_fd.write(f"[{time.time():.0f}] makrun launch\n")
    _stderr_fd.write(f"  cwd: {_makrun_dir}\n")
    _stderr_fd.write(f"  cmd: {' '.join(_cmd)}\n")
    _stderr_fd.write(f"  WINEPREFIX: {_launch_env.get('WINEPREFIX','')}\n")
    _stderr_fd.write(f"  PROTONPATH: {_launch_env.get('PROTONPATH','')}\n")
    _stderr_fd.write(f"  GAMEID: {_launch_env.get('GAMEID','')}\n")
    _stderr_fd.write(f"  PYTHONHOME: {_launch_env.get('PYTHONHOME','(removed)' if 'PYTHONHOME' not in _launch_env else 'PRESENT')}\n")
    _stderr_fd.write(f"  exe exists: {os.path.isfile(full_exe)}\n")
    _stderr_fd.flush()

    _proc = subprocess.Popen(
        _cmd,
        stdout=subprocess.DEVNULL,
        stderr=_stderr_fd,
        start_new_session=True,
        cwd=_makrun_dir,
        env=_launch_env,
    )
    _stderr_fd.write(f"  spawned PID: {_proc.pid}\n")
    _stderr_fd.flush()
    return {"success": True, "pid": _proc.pid, "method": "makrun"}


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
