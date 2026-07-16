#!/usr/bin/env python3
"""
core/server.py — RPC Server Unificado (JSON-lines sobre stdin/stdout).

ÚNICO servidor RPC. Substitui:
  - tools/python-rpc/protonforge-api/server.py
  - data/install-api/proton_recommended/python/server.py

Protocolo:
    Request:  {"id": 1, "method": "ping", "params": {}}
    Response: {"id": 1, "result": "pong"}
    Error:    {"id": 1, "error": {"code": "...", "message": "..."}}
    Event:    {"event": "ready", "protocolVersion": 1}

Uso:
    python server.py --stdio                    # loop persistente (Electron)
    echo '{"id":1,"method":"ping"}' | python server.py  # single-shot
"""

import json
import os
import sys
import time
import traceback
import threading
from datetime import datetime, timezone

# Garante que os paths de importação estão corretos
_this_dir = os.path.dirname(os.path.abspath(__file__))
_mods_manager_root = os.path.dirname(_this_dir)          # Mods_manager/
_tools_root = os.path.dirname(_mods_manager_root)        # tools/
for _p in [
    _mods_manager_root,
    os.path.join(_tools_root, "python-rpc", "protonforge-api"),
    os.path.join(_tools_root, "..", "data", "install-api", "proton_recommended", "python"),
]:
    _normalized = os.path.normpath(os.path.abspath(_p))
    if _normalized not in sys.path:
        sys.path.insert(0, _normalized)

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.log")


def log_msg(*args):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] {' '.join(str(a) for a in args)}"
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def write_event(event_type: str, **data):
    sys.stdout.write(
        json.dumps({"event": event_type, **data}, ensure_ascii=True, separators=(",", ":")) + "\n"
    )
    sys.stdout.flush()


def write_response(payload: dict):
    serialized = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    sys.stdout.write(serialized + "\n")
    sys.stdout.flush()


class RpcError(Exception):
    def __init__(self, code: str, message: str | None = None):
        self.code = code
        self.message = message or code


METHODS: dict[str, callable] = {}


def register(method: str):
    def wrapper(func):
        METHODS[method] = func
        return func
    return wrapper


def dispatch(method: str, params: object | None) -> object:
    if method not in METHODS:
        raise RpcError("method_not_found", f"Unknown method: {method}")
    return METHODS[method](params or {})


# ─── Métodos RPC ────────────────────────────────────────────────

@register("ping")
def handle_ping(params: dict) -> str:
    return "pong"


@register("storage_get")
def handle_storage_get(params: dict):
    import core.storage as storage
    if not isinstance(params, dict) or "key" not in params:
        raise RpcError("invalid_params", "key required")
    return storage.get(params["key"])


@register("storage_put")
def handle_storage_put(params: dict):
    import core.storage as storage
    if not isinstance(params, dict) or "key" not in params:
        raise RpcError("invalid_params", "key and value required")
    storage.put(params["key"], params.get("value"))
    return {"ok": True}


@register("storage_delete")
def handle_storage_delete(params: dict):
    import core.storage as storage
    if not isinstance(params, dict) or "key" not in params:
        raise RpcError("invalid_params", "key required")
    storage.delete(params["key"])
    return {"ok": True}


@register("storage_keys")
def handle_storage_keys(params: dict):
    import core.storage as storage
    prefix = ""
    if isinstance(params, dict):
        prefix = params.get("prefix", "")
    return storage.keys(prefix)


@register("storage_entries")
def handle_storage_entries(params: dict):
    import core.storage as storage
    prefix = ""
    if isinstance(params, dict):
        prefix = params.get("prefix", "")
    return storage.entries(prefix)


@register("play_game")
def handle_play_game(params: dict):
    if not isinstance(params, dict) or "game_id" not in params:
        raise RpcError("invalid_params", "game_id required")
    profile = params.get("profile", "Default")
    from core.play import play_game
    return play_game(params["game_id"], profile)


@register("detect_game")
def handle_detect_game(params: dict):
    if not isinstance(params, dict) or "game_id" not in params:
        raise RpcError("invalid_params", "game_id required")
    from core.detection import detect_game
    return detect_game(params["game_id"])


@register("deploy_mods")
def handle_deploy_mods(params: dict):
    if not isinstance(params, dict) or "game_id" not in params:
        raise RpcError("invalid_params", "game_id required")
    from core.deploy import deploy_mods
    return deploy_mods(
        game_id=params["game_id"],
        game_path=params.get("game_path", ""),
        staging_dir=params.get("staging_dir", ""),
        modlist=params.get("modlist", []),
        link_mode=params.get("link_mode", "hardlink"),
        profile=params.get("profile", "Default"),
    )


@register("undeploy_mods")
def handle_undeploy_mods(params: dict):
    if not isinstance(params, dict) or "game_path" not in params:
        raise RpcError("invalid_params", "game_path required")
    from core.deploy import undeploy_mods
    return undeploy_mods(
        game_path=params["game_path"],
        staging_dir=params.get("staging_dir", ""),
        filemap_path=params.get("filemap_path"),
    )


# ─── Game Lifecycle ────────────────────────────────────────────

@register("kill_game")
def handle_kill_game(params: dict):
    from core.engine.launch import kill_game
    pid = params.get("pid") if isinstance(params, dict) else None
    game_id = params.get("game_id") if isinstance(params, dict) else None
    return {"success": kill_game(pid=pid, game_id=game_id)}


@register("game_status")
def handle_game_status(params: dict):
    game_id = params.get("game_id") if isinstance(params, dict) else None
    import psutil
    from core.engine.launch import MANAGED_RUNTIME_DIR
    result = {"alive": False, "pid": None, "uptime": None, "method": None}
    if game_id:
        from core import storage
        pid = storage.get(f"game:{game_id}:pid")
        if pid:
            try:
                p = psutil.Process(pid)
                if p.is_running():
                    result["alive"] = True
                    result["pid"] = pid
                    result["uptime"] = time.time() - p.create_time()
                    return result
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    return result


@register("container_run")
def handle_container_run(params: dict):
    """Executa um executável via Makai Time (detached, quick-exit).
    Equivalente ao antigo MakaiTime.runExecutable()."""
    exe_path = params.get("exe_path")
    proton_path = params.get("proton_path")
    prefix_path = params.get("prefix_path")
    if not exe_path or not proton_path or not prefix_path:
        raise RpcError("invalid_params", "exe_path, proton_path, prefix_path required")
    game_path = params.get("game_path") or os.path.dirname(exe_path)
    steam_app_id = params.get("steam_app_id")
    env_overrides = params.get("env_overrides")

    from core.engine.launch import launch_game
    result = launch_game(
        game_path=game_path,
        exe_path=os.path.basename(exe_path),
        prefix_path=prefix_path,
        proton_path=proton_path,
        steam_app_id=steam_app_id,
        env_overrides=env_overrides,
    )
    return result


@register("container_run_installer")
def handle_container_run_installer(params: dict):
    """Executa um instalador via Makai Time (espera exit).
    Equivalente ao antigo MakaiTime.runInstaller()."""
    import subprocess
    exe_path = params.get("exe_path")
    proton_path = params.get("proton_path")
    prefix_path = params.get("prefix_path")
    if not exe_path or not proton_path or not prefix_path:
        raise RpcError("invalid_params", "exe_path, proton_path, prefix_path required")
    game_path = params.get("game_path") or os.path.dirname(exe_path)
    steam_app_id = params.get("steam_app_id")
    env_overrides = params.get("env_overrides")

    _prefix_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..", "..", "prefix",
    )
    expanded_proton = os.path.expanduser(proton_path)
    expanded_prefix = os.path.expanduser(prefix_path)

    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)
    env["WINEPREFIX"] = expanded_prefix
    if steam_app_id:
        env.setdefault("SteamAppId", steam_app_id)

    import sys as _sys
    _cmd = [
        _sys.executable, "-m", "makai_time.makai_time",
        "--game-exe", exe_path,
        "--proton-path", expanded_proton,
        "--prefix-path", expanded_prefix,
        "--game-path", game_path,
        "--quiet",
    ]
    try:
        _proc = subprocess.Popen(
            _cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=False,
            cwd=_prefix_dir,
        )
        _exit_code = _proc.wait()
        return {"exitCode": _exit_code, "signal": None, "exitTimestamp": time.time()}
    except FileNotFoundError:
        return {"exitCode": -1, "signal": None, "exitTimestamp": time.time(), "error": "python not found"}


# ─── Game Installation ──────────────────────────────────────────

@register("detect_installer_type")
def handle_detect_installer_type(params: dict):
    from core.game_install import detect_installer_type
    source_path = params.get("source_path") if isinstance(params, dict) else None
    if not source_path:
        raise RpcError("invalid_params", "source_path required")
    return detect_installer_type(str(source_path))


@register("copy_to_prefix")
def handle_copy_to_prefix(params: dict):
    from core.game_install import copy_to_prefix
    source_path = params.get("source_path") if isinstance(params, dict) else None
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    if not source_path or not prefix_path:
        raise RpcError("invalid_params", "source_path and prefix_path required")
    return copy_to_prefix(str(source_path), str(prefix_path))


@register("scan_prefix_for_exes")
def handle_scan_prefix_for_exes(params: dict):
    from core.game_install import scan_prefix_for_exes
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    if not prefix_path:
        raise RpcError("invalid_params", "prefix_path required")
    return scan_prefix_for_exes(str(prefix_path))


@register("snapshot_prefix")
def handle_snapshot_prefix(params: dict):
    from core.game_install import snapshot_prefix
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    if not prefix_path:
        raise RpcError("invalid_params", "prefix_path required")
    return snapshot_prefix(str(prefix_path))


@register("find_new_executables")
def handle_find_new_executables(params: dict):
    from core.game_install import find_new_executables
    before = params.get("before") if isinstance(params, dict) else None
    after = params.get("after") if isinstance(params, dict) else None
    if before is None or after is None:
        raise RpcError("invalid_params", "before and after required")
    return find_new_executables(list(before), list(after))


@register("install_game")
def handle_install_game(params: dict):
    """Fluxo completo de instalação de jogo (portátil ou instalador)."""
    from core.game_install import install_game
    source_path = params.get("source_path") if isinstance(params, dict) else None
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    proton_path = params.get("proton_path") if isinstance(params, dict) else None
    game_id = params.get("game_id", "") if isinstance(params, dict) else ""
    existing_exe_path = params.get("existing_exe_path") if isinstance(params, dict) else None
    if not source_path or not prefix_path or not proton_path:
        raise RpcError("invalid_params", "source_path, prefix_path, proton_path required")

    def _progress(step, pct, msg):
        write_event("install_progress", step=step, percent=pct, message=msg)

    return install_game(
        source_path=str(source_path),
        prefix_path=str(prefix_path),
        proton_path=str(proton_path),
        game_id=str(game_id),
        existing_exe_path=str(existing_exe_path) if existing_exe_path else None,
        progress_callback=_progress,
    )


@register("health_check")
def handle_health_check(params: dict):
    import shutil
    checks = {
        "bwrap": shutil.which("bwrap") is not None,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "steamrt4": False,
    }
    from core.engine.launch import MANAGED_RUNTIME_DIR
    import glob
    checks["steamrt4"] = len(glob.glob(os.path.join(MANAGED_RUNTIME_DIR, "files", "lib", "*"))) > 0
    return checks


# ─── Proton Management ─────────────────────────────────────────

@register("recommend_proton")
def handle_recommend_proton(params: dict):
    from api.services import recommendation
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return recommendation.recommend(str(game_id))


@register("get_game_info")
def handle_get_game_info(params: dict):
    from api.services import recommendation
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return recommendation.get_game_info(str(game_id))


@register("search_games")
def handle_search_games(params: dict):
    from api.services import recommendation
    query = params.get("query")
    if not query:
        raise RpcError("missing_param", "query is required")
    return recommendation.search_games(str(query))


@register("get_installed_protons")
def handle_get_installed_protons(params: dict):
    from api.services import proton_versions
    return proton_versions.get_installed_protons()


@register("list_available_forks")
def handle_list_available_forks(params: dict):
    from api.services import recommendation
    return recommendation.get_available_forks()


@register("check_anticheat")
def handle_check_anticheat(params: dict):
    from api.services import anticheat
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return anticheat.check_anticheat(str(game_id))


@register("analyze_exe")
def handle_analyze_exe(params: dict):
    try:
        from api.services import compatflow_bridge
    except ImportError:
        compatflow_bridge = None
    if not compatflow_bridge:
        return {"success": False, "error": "compatflow_bridge not available"}
    exe_path = params.get("exe_path")
    if not exe_path:
        return {"success": False, "error": "exe_path is required"}
    return compatflow_bridge.analyze_exe(exe_path)


# ─── DLL / Prefix / Makaitricks ─────────────────────────────────

@register("get_recommended_dlls")
def handle_get_recommended_dlls(params: dict):
    from api.services import dlls
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return dlls.get_recommended_dlls(str(game_id))


@register("install_game_dlls")
def handle_install_game_dlls(params: dict):
    from api.services import prefix
    game_id = params.get("game_id")
    prefix_path = params.get("prefix_path")
    proton_path = params.get("proton_path")
    if not all([game_id, prefix_path, proton_path]):
        raise RpcError("missing_param", "game_id, prefix_path, proton_path are required")
    return prefix.install_recommended_dlls(
        game_id=str(game_id),
        prefix_path=str(prefix_path),
        proton_path=str(proton_path),
        extra_verbs=params.get("extra_verbs"),
    )


@register("install_makaitricks")
def handle_install_makaitricks(params: dict):
    prefix_path = params.get("prefix_path")
    proton_path = params.get("proton_path")
    verbs = params.get("verbs")
    if not prefix_path or not proton_path or not verbs:
        raise RpcError("missing_param", "prefix_path, proton_path, verbs are required")
    if not isinstance(verbs, list):
        raise RpcError("invalid_param", "verbs must be a list")
    from core.engine.makaitricks import run_multiple
    result = run_multiple(verbs, prefix_path, proton_path)
    return result


@register("create_prefix")
def handle_create_prefix(params: dict):
    game_id = params.get("game_id")
    proton_path = params.get("proton_path")
    if not game_id or not proton_path:
        raise RpcError("missing_param", "game_id and proton_path are required")
    prefix_path = params.get("prefix_path")
    auto_dlls = params.get("auto_dlls", True)
    extra_verbs = params.get("extra_verbs")
    game_path = params.get("game_path", "")

    import sys as _sys
    _prefix_lib = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..", "prefix", "python",
    )
    if _prefix_lib not in _sys.path:
        _sys.path.insert(0, _prefix_lib)

    if prefix_path:
        os.environ.setdefault("STEAM_COMPAT_DATA_PATH", prefix_path)
        os.environ.setdefault("WINEPREFIX", prefix_path)
    if game_path:
        os.environ.setdefault("STEAM_COMPAT_INSTALL_PATH", game_path)
    from prefix.core import create_prefix as cp
    return cp(
        game_id=str(game_id),
        proton_path=str(proton_path),
        prefix_path=str(prefix_path) if prefix_path else None,
        auto_dlls=bool(auto_dlls),
        extra_verbs=extra_verbs,
    )


@register("get_launch_command")
def handle_get_launch_command(params: dict):
    from core.engine.launch import launch_game
    game_id = params.get("game_id")
    prefix_path = params.get("prefix_path")
    proton_path = params.get("proton_path")
    executable = params.get("executable")
    if not all([game_id, prefix_path, proton_path, executable]):
        raise RpcError("missing_param", "game_id, prefix_path, proton_path, executable are required")
    game_path = params.get("game_path") or os.path.dirname(executable)
    result = launch_game(
        game_path=game_path,
        exe_path=executable,
        prefix_path=prefix_path,
        proton_path=proton_path,
        steam_app_id=params.get("steam_app_id"),
        env_overrides=params.get("env_overrides"),
    )
    return result


# ─── Prefix Management ─────────────────────────────────────────

@register("delete_prefix")
def handle_delete_prefix(params: dict):
    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")
    import sys as _sys
    _prefix_lib = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..", "prefix", "python",
    )
    if _prefix_lib not in _sys.path:
        _sys.path.insert(0, _prefix_lib)
    from prefix.core import delete_prefix
    return {"success": delete_prefix(str(prefix_path))}


@register("clean_prefix")
def handle_clean_prefix(params: dict):
    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")
    import sys as _sys
    _prefix_lib = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..", "prefix", "python",
    )
    if _prefix_lib not in _sys.path:
        _sys.path.insert(0, _prefix_lib)
    from prefix.core import clean_prefix
    return {"success": clean_prefix(str(prefix_path))}


@register("get_prefix_saves")
def handle_get_prefix_saves(params: dict):
    import os
    from pathlib import Path
    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")
    pfx = Path(prefix_path)
    if not pfx.is_dir():
        return {"saves": [], "error": "prefix directory not found"}
    saves = []
    game_id = params.get("game_id", "")
    search_bases = [
        "drive_c/users/*/Documents/My Games",
        "drive_c/users/*/AppData/Local",
        "drive_c/users/*/AppData/Roaming",
    ]
    for pattern in search_bases:
        for base in pfx.glob(pattern):
            if not base.is_dir():
                continue
            for child in base.iterdir():
                if not child.is_dir():
                    continue
                child_lower = child.name.lower()
                if game_id:
                    gid = game_id.lower().replace("_", "").replace("-", "")
                    cname = child_lower.replace("_", "").replace("-", "").replace(" ", "")
                    if gid not in cname and cname not in gid:
                        continue
                saves.append(str(child.relative_to(pfx)))
    return {"saves": saves}


@register("restore_saves")
def handle_restore_saves(params: dict):
    import shutil
    from pathlib import Path
    prefix_path = params.get("prefix_path")
    saves_backup = params.get("saves_backup", [])
    backup_source = params.get("backup_source")
    if not all([prefix_path, backup_source]):
        raise RpcError("missing_param", "prefix_path and backup_source are required")
    pfx = Path(prefix_path)
    src = Path(backup_source)
    restored = []
    errors = []
    for save_rel in saves_backup:
        src_path = src / save_rel
        dst_path = pfx / save_rel
        if not src_path.exists():
            errors.append(f"{save_rel}: fonte não encontrada em {backup_source}")
            continue
        try:
            if dst_path.exists():
                shutil.rmtree(dst_path)
            shutil.copytree(src_path, dst_path)
            restored.append(save_rel)
        except Exception as e:
            errors.append(f"{save_rel}: {str(e)[:150]}")
    return {"restored": restored, "errors": errors}


# ─── Mod Management ─────────────────────────────────────────────

@register("mod_fomod_parse")
def handle_mod_fomod_parse(params: dict):
    mod_path = params.get("mod_path")
    if not mod_path:
        raise RpcError("missing_param", "mod_path is required")
    from api.services.mod_manager import fomod
    return fomod.parse(str(mod_path))


@register("mod_fomod_install")
def handle_mod_fomod_install(params: dict):
    mod_path = params.get("mod_path")
    selections = params.get("selections")
    if not mod_path or selections is None:
        raise RpcError("missing_param", "mod_path and selections are required")
    from api.services.mod_manager import fomod
    return fomod.install(str(mod_path), selections)


@register("mod_nexus_search")
def handle_mod_nexus_search(params: dict):
    query = params.get("query")
    game_id = params.get("game_id")
    if not query:
        raise RpcError("missing_param", "query is required")
    from api.services.mod_manager import nexus
    return nexus.search(str(query), str(game_id) if game_id else None)


@register("mod_nexus_trending")
def handle_mod_nexus_trending(params: dict):
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    from api.services.mod_manager import nexus
    return nexus.trending(str(game_id))


@register("mod_read_plugins")
def handle_mod_read_plugins(params: dict):
    path = params.get("path")
    if not path:
        raise RpcError("missing_param", "path is required")
    from api.services.mod_manager import plugins
    return plugins.read(str(path), params.get("star_prefix", True))


@register("mod_write_plugins")
def handle_mod_write_plugins(params: dict):
    path = params.get("path")
    entries = params.get("entries")
    if not path or entries is None:
        raise RpcError("missing_param", "path and entries are required")
    from api.services.mod_manager import plugins
    return plugins.write(str(path), entries, params.get("star_prefix", True))


@register("recommend_proton_for_modding")
def handle_recommend_proton_for_modding(params: dict):
    from api.services import mod_compat
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return mod_compat.recommend_proton_for_modding(str(game_id))


@register("list_mod_compatible_games")
def handle_list_mod_compatible_games(params: dict):
    from api.services import mod_compat
    query = params.get("query", "")
    return mod_compat.list_mod_compatible_games(str(query) if query else "")


@register("rate_releases")
def handle_rate_releases(params: dict):
    from collections import OrderedDict
    releases = params.get("releases") or []
    if not releases:
        return []
    try:
        from api.services.data import _load_json
        protons = _load_json("protons.json")
    except ImportError:
        protons = {}
    tool_names = {
        "proton-ge": "GE-Proton", "valve-proton": "Valve Proton",
        "dw-proton": "DW-Proton", "proton-cachyos": "CachyOS Proton",
        "proton-tkg": "Proton-TKG", "proton-em": "Proton-EM",
        "proton-ge-rtsp": "GE-Proton RTSP", "wine-vanilla": "Wine Vanilla",
        "wine-staging": "Wine Staging", "wine-tkg": "Wine-TKG",
    }
    name_scores: dict[str, int] = {}
    for fdata in protons.values():
        nm = (fdata.get("name") or "").lower()
        if nm:
            name_scores[nm] = int(fdata.get("tierScore", 70))
    groups: dict[str, list] = OrderedDict()
    for r in releases:
        groups.setdefault(r.get("toolId", ""), []).append(r)
    out: list[dict] = []
    for tid, group in groups.items():
        display = tool_names.get(tid, tid)
        base = name_scores.get(display.lower(), 70)
        sorted_rel = sorted(group, key=lambda x: x.get("published", "") or "", reverse=True)
        n = len(sorted_rel)
        for pos, r in enumerate(sorted_rel):
            score = max(25, int(base) - pos * max(1, base // (n + 2 if n > 1 else 1)))
            r2 = dict(r)
            r2["rating"] = score
            out.append(r2)
    return out


# ─── Download / Extract ─────────────────────────────────────────

@register("download_file")
def handle_download_file(params: dict):
    url = params.get("url")
    dest = params.get("dest")
    if not url or not dest:
        raise RpcError("missing_param", "url and dest are required")
    import urllib.request
    import shutil
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url) as response:
        with open(dest, "wb") as f:
            shutil.copyfileobj(response, f)
    return {"success": True, "dest": dest}


@register("extract_archive")
def handle_extract_archive(params: dict):
    import subprocess
    import shutil
    archive = params.get("archive")
    dest = params.get("dest")
    password = params.get("password")
    if not archive or not dest:
        raise RpcError("missing_param", "archive and dest are required")
    ext = archive.lower()
    os.makedirs(dest, exist_ok=True)
    if ext.endswith(".zip"):
        import zipfile
        try:
            with zipfile.ZipFile(archive, "r") as zf:
                zf.extractall(dest, pwd=password.encode() if password else None)
        except RuntimeError as e:
            if "password" in str(e).lower():
                raise RpcError("password_protected", str(e)[:200])
            raise
    elif ext.endswith(".tar.gz") or ext.endswith(".tgz"):
        import tarfile
        with tarfile.open(archive, "r:gz") as tf:
            tf.extractall(dest)
    elif ext.endswith(".tar.xz") or ext.endswith(".txz"):
        import tarfile
        with tarfile.open(archive, "r:xz") as tf:
            tf.extractall(dest)
    elif ext.endswith(".tar"):
        import tarfile
        with tarfile.open(archive, "r:") as tf:
            tf.extractall(dest)
    elif ext.endswith(".7z"):
        cmd = ["7z", "x", archive, f"-o{dest}"]
        if password:
            cmd.append(f"-p{password}")
        subprocess.run(cmd, check=False)
    elif ext.endswith(".rar"):
        cmd = ["unrar", "x", archive, dest]
        if password:
            cmd.append(f"-p{password}")
        subprocess.run(cmd, check=False)
    else:
        raise RpcError("unsupported_format", f"Unsupported archive: {ext}")
    return {"success": True, "dest": dest}


# ─── Archiving (extended) ────────────────────────────────────────

@register("read_archive")
def handle_read_archive(params: dict):
    import subprocess
    archive = params.get("archive")
    if not archive:
        raise RpcError("missing_param", "archive is required")
    sevenz = "7z"
    try:
        output = subprocess.check_output(
            [sevenz, "l", "-slt", archive],
            stderr=subprocess.STDOUT, timeout=60,
        ).decode("utf-8", errors="replace")
    except FileNotFoundError:
        raise RpcError("not_found", "7z not found")
    except subprocess.CalledProcessError as e:
        stderr = (e.output or b"").decode("utf-8", errors="replace")
        if "wrong password" in stderr.lower() or "encrypted" in stderr.lower():
            raise RpcError("password_protected", "Archive is password protected")
        raise RpcError("extraction_failed", stderr[:200])
    entries = []
    current = {}
    for line in output.split("\n"):
        line = line.strip()
        if line.startswith("Path = "):
            if current.get("path"):
                entries.append(current)
            current = {"path": line[7:], "size": 0, "compressedSize": 0, "isDirectory": False}
        elif line.startswith("Size = "):
            current["size"] = int(line[7:]) or 0
        elif line.startswith("Pack Size = "):
            current["compressedSize"] = int(line[12:]) or 0
        elif line.startswith("CRC = "):
            current["crc32"] = line[6:]
        elif line.startswith("Folder = +"):
            current["isDirectory"] = True
    if current.get("path"):
        entries.append(current)
    total_size = sum(e.get("size", 0) for e in entries if not e.get("isDirectory"))
    total_files = sum(1 for e in entries if not e.get("isDirectory"))
    return {
        "path": archive,
        "name": os.path.basename(archive),
        "totalSize": total_size,
        "totalFiles": total_files,
        "format": os.path.splitext(archive)[1].lstrip("."),
        "entries": entries,
    }


@register("extract_file_to_string")
def handle_extract_file_to_string(params: dict):
    import subprocess
    archive = params.get("archive")
    filepath = params.get("filepath")
    if not archive or not filepath:
        raise RpcError("missing_param", "archive and filepath are required")
    sevenz = "7z"
    try:
        content = subprocess.check_output(
            [sevenz, "e", "-so", archive, filepath],
            stderr=subprocess.STDOUT, timeout=30,
        )
        # Handle UTF-16 BOM
        if len(content) >= 2 and content[0] == 0xFF and content[1] == 0xFE:
            content = content[2:]
        return {"content": content.decode("utf-8", errors="replace")}
    except subprocess.CalledProcessError as e:
        raise RpcError("extraction_failed", (e.output or b"").decode("utf-8", errors="replace")[:200])
    except Exception as e:
        raise RpcError("internal_error", str(e)[:200])


# ─── Shell utilities ─────────────────────────────────────────────

@register("exec_command")
def handle_exec_command(params: dict):
    import subprocess
    command = params.get("command")
    if not command:
        raise RpcError("missing_param", "command is required")
    timeout = params.get("timeout", 30)
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, timeout=timeout,
        )
        return {
            "returncode": result.returncode,
            "stdout": result.stdout.decode("utf-8", errors="replace"),
            "stderr": result.stderr.decode("utf-8", errors="replace"),
        }
    except subprocess.TimeoutExpired:
        return {"returncode": -1, "stdout": "", "stderr": "Command timed out"}
    except Exception as e:
        return {"returncode": -1, "stdout": "", "stderr": str(e)}


@register("delete_paths")
def handle_delete_paths(params: dict):
    import shutil
    paths = params.get("paths")
    if not paths:
        raise RpcError("missing_param", "paths is required")
    if isinstance(paths, str):
        paths = [paths]
    results = []
    for p in paths:
        try:
            if os.path.isdir(p):
                shutil.rmtree(p)
            elif os.path.isfile(p):
                os.unlink(p)
            results.append({"path": p, "success": True})
        except Exception as e:
            results.append({"path": p, "success": False, "error": str(e)[:150]})
    return {"results": results}


@register("disk_space")
def handle_disk_space(params: dict):
    import shutil
    path = params.get("path", "/tmp")
    usage = shutil.disk_usage(path)
    return {
        "total": usage.total,
        "used": usage.used,
        "free": usage.free,
        "path": path,
    }


# ─── ESLifier ─────────────────────────────────────────────────────

@register("eslify")
def handle_eslify(params: dict):
    plugin_path = params.get("plugin_path")
    if not plugin_path:
        raise RpcError("missing_param", "plugin_path is required")
    dry_run = params.get("dry_run", False)
    safe_check = params.get("safe_check", True)

    script = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..", "..", "data", "install-api", "proton_recommended",
        "python", "Utils", "eslifier.py",
    )
    if not os.path.exists(script):
        raise RpcError("not_found", f"eslifier.py not found: {script}")

    args = [sys.executable, script, plugin_path]
    if dry_run:
        args.append("--dry-run")
    if not safe_check:
        args.append("--no-safe-check")

    import subprocess
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timed out after 30s"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    if result.returncode != 0:
        return {"success": False, "error": result.stderr or f"Exit code {result.returncode}"}
    try:
        return json.loads(result.stdout)
    except Exception:
        return {"success": False, "error": f"Invalid output: {result.stdout[:200]}"}


# ─── Bridge passthrough (legacy bridge.py commands) ──────────────

@register("bridge_command")
def handle_bridge_command(params: dict):
    cmd = params.get("cmd")
    if not cmd:
        raise RpcError("missing_param", "cmd is required")
    bridge_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..", "..", "data", "install-api", "proton_recommended", "python", "bridge",
    )
    if bridge_dir not in sys.path:
        sys.path.insert(0, bridge_dir)
    configs = {}
    config_dir = os.path.join(os.path.expanduser("~"), ".config", "ProtonForgeMods", "games")
    if os.path.isdir(config_dir):
        import glob as _glob
        for f in _glob.glob(os.path.join(config_dir, "*.json")):
            try:
                with open(f) as _fh:
                    data = json.load(_fh)
                    configs[data.get("name", os.path.splitext(os.path.basename(f))[0])] = data
            except Exception:
                pass

    try:
        if cmd == "list_games":
            from bridge import cmd_list_games
            return cmd_list_games(configs)
        elif cmd == "list_profiles":
            from bridge import cmd_list_profiles
            return cmd_list_profiles(configs, params.get("game_key", ""))
        elif cmd == "discover_games":
            from bridge import cmd_discover_games
            return cmd_discover_games(configs)
        elif cmd == "sync_steam_games":
            from bridge import cmd_sync_steam_games
            return cmd_sync_steam_games(configs)
        elif cmd == "bsa_invalidate":
            from Utils.games.bsa_invalidation import apply_bsa_invalidation, remove_bsa_invalidation
            game_path = params.get("game_path", "")
            game_id = params.get("game_id", "")
            enable = params.get("enable", True)
            from pathlib import Path
            if enable:
                result = apply_bsa_invalidation(Path(game_path), game_id)
            else:
                result = remove_bsa_invalidation(Path(game_path), game_id)
            return {"ok": True, "data": result}
        elif cmd == "loot_sort":
            return {"ok": False, "error": "LOOT sorting requires Amethyst backend"}
        elif cmd == "deploy":
            return {"ok": False, "error": "Deploy requires Amethyst backend"}
        elif cmd == "restore":
            return {"ok": False, "error": "Restore requires Amethyst backend"}
        elif cmd == "run_wine_tool":
            from Utils.wine_runner import run_wine_tool
            prefix_path = params.get("prefix_path", "")
            tool = params.get("tool", "winecfg")
            if not prefix_path or not os.path.isdir(os.path.dirname(prefix_path)):
                return {"ok": False, "error": "Prefix path not found"}
            result = run_wine_tool(prefix_path, tool)
            return {"ok": True, "data": {"tool": tool, "result": result}}
        elif cmd == "get_prefix_info":
            from pathlib import Path
            prefix_path = params.get("prefix_path", "")
            if not prefix_path:
                return {"ok": False, "error": "No prefix path provided"}
            pfx = Path(prefix_path)
            return {
                "ok": True,
                "data": {
                    "prefix_path": str(pfx),
                    "has_user_reg": (pfx / "user.reg").is_file(),
                    "has_system_reg": (pfx / "system.reg").is_file(),
                    "has_drive_c": (pfx / "drive_c").is_dir(),
                },
            }
        else:
            return {"ok": False, "error": f"Unknown command: {cmd}"}
    except ImportError as e:
        return {"ok": False, "error": f"Bridge module not available: {str(e)[:100]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@register("launch_native_tool")
def handle_launch_native_tool(params: dict):
    import subprocess
    exe_path = params.get("exe_path")
    if not exe_path:
        raise RpcError("missing_param", "exe_path is required")
    args = params.get("args", [])
    cwd = params.get("cwd")
    if not os.path.exists(exe_path):
        raise RpcError("not_found", f"Executable not found: {exe_path}")
    subprocess.Popen(
        [exe_path, *args],
        cwd=cwd or os.path.dirname(exe_path),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {"success": True, "pid": None}


# ─── System Info ─────────────────────────────────────────────────

@register("gpu_info")
def handle_gpu_info(params: dict):
    _prefix_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "prefix",
    )
    import sys as _sys
    if _prefix_dir not in _sys.path:
        _sys.path.insert(0, _prefix_dir)
    from makai_time.core.gpu import info
    return info()


@register("sync_info")
def handle_sync_info(params: dict):
    _prefix_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "prefix",
    )
    import sys as _sys
    if _prefix_dir not in _sys.path:
        _sys.path.insert(0, _prefix_dir)
    from makai_time.core.sync import info
    return info()


@register("runtime_info")
def handle_runtime_info(params: dict):
    from core.engine.launch import MANAGED_RUNTIME_DIR
    import glob
    runtimes = glob.glob(os.path.join(MANAGED_RUNTIME_DIR, "*"))
    return {
        "runtimes": [os.path.basename(r) for r in runtimes if os.path.isdir(r)],
        "managed_dir": MANAGED_RUNTIME_DIR,
    }


# ─── Handler ─────────────────────────────────────────────────────

def handle_request(payload: dict):
    request_id = payload.get("id")
    method = payload.get("method")
    params = payload.get("params")

    if request_id is None:
        write_response({
            "id": None,
            "error": {"code": "invalid_request", "message": "Missing request id"},
        })
        return

    if not isinstance(method, str) or not method:
        write_response({
            "id": request_id,
            "error": {"code": "invalid_method", "message": "Invalid method"},
        })
        return

    try:
        result = dispatch(method, params)
        write_response({"id": request_id, "result": result})
        log_msg("OK", method, str(request_id))
    except RpcError as e:
        log_msg("RPC_ERROR", method, str(request_id), e.code, e.message)
        write_response({
            "id": request_id,
            "error": {"code": e.code, "message": e.message},
        })
    except Exception as e:
        log_msg("EXCEPTION", method, str(request_id), str(e)[:200])
        traceback.print_exc(file=sys.stderr)
        write_response({
            "id": request_id,
            "error": {"code": "internal_error", "message": str(e)[:200]},
        })


# ─── Loop ───────────────────────────────────────────────────────

def start_stdio_rpc_loop():
    log_msg("SERVER", "started", "--stdio")
    write_response({"event": "ready", "protocolVersion": 1})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as e:
            write_response({
                "id": None,
                "error": {"code": "invalid_json", "message": str(e)},
            })
            continue
        if not isinstance(payload, dict):
            write_response({
                "id": None,
                "error": {"code": "invalid_request", "message": "Request must be an object"},
            })
            continue
        handle_request(payload)


def main():
    if "--stdio" in sys.argv:
        start_stdio_rpc_loop()
        return
    if not sys.stdin.isatty():
        raw_line = sys.stdin.readline().strip()
        if raw_line:
            try:
                payload = json.loads(raw_line)
                handle_request(payload)
            except json.JSONDecodeError as e:
                write_response({
                    "id": None,
                    "error": {"code": "invalid_json", "message": str(e)},
                })
        return
    start_stdio_rpc_loop()


if __name__ == "__main__":
    main()
