"""
Prefix management: create, delete, clean, validate.

Aligned with tools/prefix/core/init.ts createPrefix() strategy.
"""

import os
import shutil
import stat
import subprocess
from pathlib import Path

from .makaitricks import install_recommended_dlls

DEFAULT_PREFIX_BASE = os.path.expanduser("~/games/proton-forger")


# ── Helpers ──────────────────────────────────────────────────────────────────

def resolve_prefix_path(game_id: str, prefix_path: str | None = None) -> str:
    if prefix_path:
        return os.path.abspath(os.path.expanduser(prefix_path))
    return os.path.join(DEFAULT_PREFIX_BASE, game_id)


def ensure_proton_valid(proton_path: str) -> bool:
    return os.path.isfile(os.path.join(proton_path, "proton"))


def prefix_exists(prefix_path: str) -> bool:
    return (
        os.path.isfile(os.path.join(prefix_path, "user.reg"))
        and os.path.isfile(os.path.join(prefix_path, "system.reg"))
    )


def is_prefix_initialized(prefix_path: str) -> bool:
    return os.path.isdir(os.path.join(prefix_path, "drive_c", "windows", "system32"))


def resolve_actual_prefix(prefix_path: str) -> str:
    if is_prefix_initialized(prefix_path):
        return prefix_path
    pfx = os.path.join(prefix_path, "pfx")
    return pfx if is_prefix_initialized(pfx) else prefix_path


def ensure_prefix_markers(prefix_path: str):
    for name in ("system.reg", "user.reg", "userdef.reg"):
        p = os.path.join(prefix_path, name)
        if not os.path.exists(p):
            with open(p, "w") as f:
                f.write("REGEDIT4\n\n")


def _find_proton_wine_binary(proton_path: str, name: str) -> str | None:
    for base in ("dist", "files"):
        candidate = os.path.join(proton_path, base, "bin", name)
        if os.path.exists(candidate):
            return candidate
    return None


def _remove_readonly(func, path, excinfo):
    os.chmod(path, stat.S_IWRITE)
    func(path)


def _has_default_pfx_error(stderr: str) -> bool:
    return "default_pfx" in stderr or "copyfile" in stderr


def _run_command(
    cmd: list[str],
    env: dict | None = None,
    timeout: int = 120,
) -> dict:
    """Run a command and return structured result."""
    try:
        result = subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=timeout,
        )
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "stdout": "", "stderr": "Command timed out", "returncode": -1}
    except FileNotFoundError:
        return {"success": False, "stdout": "", "stderr": f"Binary not found: {cmd[0]}", "returncode": -1}


def build_env(prefix_path: str, compat_data_path: str | None = None) -> dict:
    env = os.environ.copy()
    env["WINEPREFIX"] = prefix_path
    env["WINEARCH"] = "win64"
    if compat_data_path:
        env["STEAM_COMPAT_DATA_PATH"] = compat_data_path
    for var in ("STEAM_COMPAT_CLIENT_INSTALL_PATH", "STEAM_COMPAT_INSTALL_PATH",
                "SteamAppId", "SteamGameId"):
        val = os.environ.get(var)
        if val:
            env[var] = val
    env["WINEDLLOVERRIDES"] = "winemenubuilder.exe=d"
    return env


# ── Unified create_prefix ────────────────────────────────────────────────────

def create_prefix(
    game_id: str,
    proton_path: str,
    prefix_path: str | None = None,
    auto_dlls: bool = True,
    extra_verbs: list[str] | None = None,
    use_umu: bool = False,
    on_progress: callable = None,
) -> dict:
    """
    Create and initialize a Wine prefix.

    Strategy (aligned with TS createPrefix):
      1. umu-run wineboot -u (if use_umu)
      2. Direct wineboot from Proton dist/files
      3. `proton wineboot -u`
      4. `proton run wineboot -u`
    """
    resolved = resolve_prefix_path(game_id, prefix_path)
    result = {
        "success": False,
        "prefix_path": resolved,
        "initialized": False,
        "dlls_installed": [],
        "errors": [],
    }

    emit = on_progress or (lambda m: None)

    if not ensure_proton_valid(proton_path):
        result["errors"].append(f"Proton not found at {proton_path}")
        return result

    if prefix_exists(resolved):
        result["success"] = True
        result["initialized"] = True
        if auto_dlls:
            dll_result = install_recommended_dlls(game_id, resolved, proton_path, extra_verbs)
            result["dlls_installed"] = dll_result["installed"]
            result["errors"].extend(dll_result["errors"])
        return result

    os.makedirs(resolved, exist_ok=True)

    compat_data_path = os.environ.get("STEAM_COMPAT_DATA_PATH", "")
    tracked_file = os.path.join(compat_data_path, "tracked_files") if compat_data_path else ""

    # Strategy 1: system wineboot (most reliable)
    sys_wineboot = shutil.which("wineboot") or _find_proton_wine_binary("/usr", "wineboot")
    if sys_wineboot:
        emit("Using system wineboot...")
        r = _run_command([sys_wineboot, "-u"], env=build_env(resolved))
        if r["success"] or prefix_exists(resolved):
            result["success"] = True
            result["initialized"] = True
            ensure_prefix_markers(resolve_actual_prefix(resolved))
            if auto_dlls:
                dll_result = install_recommended_dlls(game_id, resolved, proton_path, extra_verbs)
                result["dlls_installed"] = dll_result["installed"]
                result["errors"].extend(dll_result["errors"])
            return result
        emit("System wineboot failed, trying umu-run...")

    # Strategy 2: umu-run
    if use_umu:
        umu = shutil.which("umu-run")
        if umu:
            emit("Using umu-run...")
            r = _run_command(
                [umu, "wineboot", "-u"],
                env={**os.environ.copy(), "WINEPREFIX": resolved, "PROTONPATH": proton_path},
            )
            if r["success"] or prefix_exists(resolved):
                result["success"] = True
                result["initialized"] = is_prefix_initialized(resolve_actual_prefix(resolved))
                ensure_prefix_markers(resolve_actual_prefix(resolved))
                if auto_dlls:
                    dll_result = install_recommended_dlls(game_id, resolved, proton_path, extra_verbs)
                    result["dlls_installed"] = dll_result["installed"]
                    result["errors"].extend(dll_result["errors"])
                return result
            emit("umu-run failed, trying direct wineboot...")

    # Strategy 2: direct wineboot from Proton dist/files
    wineboot = _find_proton_wine_binary(proton_path, "wineboot")
    if wineboot:
        emit("Using direct wineboot...")
        r = _run_command([wineboot, "-u"], env=build_env(resolved))
        if r["success"] or prefix_exists(resolved) or is_prefix_initialized(resolve_actual_prefix(resolved)):
            result["success"] = True
            result["initialized"] = True
            ensure_prefix_markers(resolve_actual_prefix(resolved))
            if auto_dlls:
                dll_result = install_recommended_dlls(game_id, resolved, proton_path, extra_verbs)
                result["dlls_installed"] = dll_result["installed"]
                result["errors"].extend(dll_result["errors"])
            return result
        emit("Direct wineboot failed, trying proton wineboot...")

    # Strategy 3: proton wineboot
    proton_bin = os.path.join(proton_path, "proton")
    emit("Using proton wineboot...")
    r = _run_command([proton_bin, "wineboot", "-u"], env=build_env(resolved))
    if r["success"] or prefix_exists(resolved):
        result["success"] = True
        result["initialized"] = True
        ensure_prefix_markers(resolve_actual_prefix(resolved))
        if auto_dlls:
            dll_result = install_recommended_dlls(game_id, resolved, proton_path, extra_verbs)
            result["dlls_installed"] = dll_result["installed"]
            result["errors"].extend(dll_result["errors"])
        return result

    if _has_default_pfx_error(r.get("stderr", "")):
        result["errors"].append("default_pfx template corrupted")
        return result

    emit("Proton wineboot failed, trying proton run wineboot...")

    # Strategy 4: proton run wineboot
    r = _run_command([proton_bin, "run", "wineboot", "-u"], env=build_env(resolved))
    if r["success"] or prefix_exists(resolved):
        result["success"] = True
        result["initialized"] = True
        ensure_prefix_markers(resolve_actual_prefix(resolved))
        if auto_dlls:
            dll_result = install_recommended_dlls(game_id, resolved, proton_path, extra_verbs)
            result["dlls_installed"] = dll_result["installed"]
            result["errors"].extend(dll_result["errors"])
        return result

    result["errors"].append(f"All strategies failed: {r.get('stderr', '')[:200]}")
    return result


# ── Legacy wrappers ──────────────────────────────────────────────────────────

def delete_prefix(prefix_path: str) -> bool:
    if not os.path.isdir(prefix_path):
        return False
    try:
        shutil.rmtree(prefix_path, onerror=_remove_readonly)
        return True
    except (PermissionError, OSError):
        return False


def clean_prefix(prefix_path: str) -> bool:
    pfx = Path(prefix_path)
    if not pfx.exists():
        return False
    try:
        shutil.rmtree(pfx, onerror=_remove_readonly)
        pfx.mkdir(parents=True, exist_ok=True)
        return True
    except OSError:
        return False
