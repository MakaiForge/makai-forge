"""
Prefix management: create, delete, clean, validate.

Aligned with tools/prefix/core/init.ts createPrefix() strategy.
"""

import ctypes
import hashlib
import os
import shutil
import stat
import subprocess
import tarfile
import urllib.request
from pathlib import Path
from secrets import token_urlsafe

from .makaitricks import install_recommended_dlls

DEFAULT_PREFIX_BASE = os.path.expanduser("~/games/proton-forger")
STEAM_RUNTIME_DIR = os.path.expanduser("~/.local/share/makaiforge/steamrt4")
STEAM_RUNTIME_CACHE = os.path.expanduser("~/.cache/makaiforge/steamrt4")
STEAM_RUNTIME_BASE = "https://repo.steampowered.com/steamrt4/images/latest-public-beta"

try:
    _libc = ctypes.CDLL(None)
    _libc.renameat2.argtypes = [
        ctypes.c_int, ctypes.c_char_p,
        ctypes.c_int, ctypes.c_char_p,
        ctypes.c_uint,
    ]
    _HAS_RENAMEAT2 = True
except (OSError, AttributeError, FileNotFoundError):
    _HAS_RENAMEAT2 = False


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


# ── Steam Runtime helpers ──────────────────────────────────────────────────────

def _fetch_url_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read().decode().strip()


def _fetch_sha256() -> str | None:
    """Fetch SHA256 do archive do SHA256SUMS remoto."""
    with urllib.request.urlopen(
        f"{STEAM_RUNTIME_BASE}/SHA256SUMS?t={token_urlsafe(16)}", timeout=30,
    ) as resp:
        for line in resp:
            parts = line.decode().strip().split()
            if len(parts) >= 2 and parts[1].endswith("SteamLinuxRuntime_4.tar.xz"):
                return parts[0]
    return None


def _download_with_resume(
    parts_file: Path, url: str, expected_hash: str, emit,
) -> Path | None:
    """Baixa archive com suporte a resume. Retorna path do arquivo completo."""
    existing = parts_file.stat().st_size if parts_file.is_file() else 0

    if existing > 0:
        emit(f"Retomando download de {existing // 1024 // 1024}MB...")

    headers = {}
    if existing > 0:
        headers["Range"] = f"bytes={existing}-"

    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(parts_file, "ab") as f:
                while chunk := resp.read(64 * 1024):
                    f.write(chunk)
    except Exception as e:
        emit(f"Download falhou: {e}")
        return None

    # SHA256 verification
    actual = hashlib.sha256()
    with open(parts_file, "rb") as f:
        while chunk := f.read(64 * 1024):
            actual.update(chunk)

    if actual.hexdigest() != expected_hash:
        emit("SHA256 mismatch — download corrompido")
        parts_file.unlink(missing_ok=True)
        return None

    emit("SHA256 OK")
    final = parts_file.parent / parts_file.name.removesuffix(".parts")
    parts_file.rename(final)
    return final


def _create_shim_and_symlinks(target_dir: Path):
    """Cria umu-shim + symlink umu → _v2-entry-point no diretório."""
    shim = target_dir / "umu-shim"
    shim.write_text(
        "#!/bin/sh\n"
        'if [ "${XDG_CURRENT_DESKTOP}" = "gamescope" ] || [ "${XDG_SESSION_DESKTOP}" = "gamescope" ]; then\n'
        '    if [ "${STEAM_MULTIPLE_XWAYLANDS}" = "1" ]; then\n'
        '        if [ -z "${DISPLAY}" ]; then\n'
        '            export DISPLAY=":1"\n'
        "        fi\n"
        "    fi\n"
        "fi\n"
        'exec "$@"\n'
    )
    shim.chmod(0o700)

    if not (target_dir / "umu").exists():
        (target_dir / "umu").symlink_to("_v2-entry-point")


def _exchange_dirs(src: Path, dest: Path):
    """Troca src → dest atomicamente. Usa renameat2 se disponível."""
    if not dest.exists():
        src.rename(dest)
        return

    if _HAS_RENAMEAT2:
        try:
            RENAME_EXCHANGE = 2
            src_fd = os.open(src.parent, os.O_DIRECTORY | os.O_CLOEXEC)
            dest_fd = os.open(dest.parent, os.O_DIRECTORY | os.O_CLOEXEC)
            ret = _libc.renameat2(
                src_fd, src.name.encode(),
                dest_fd, dest.name.encode(),
                RENAME_EXCHANGE,
            )
            os.close(src_fd)
            os.close(dest_fd)
            if ret == 0:
                shutil.rmtree(src, ignore_errors=True)
                return
        except OSError:
            pass

    # Fallback: move dest → backup, move src → dest, remove backup
    backup = dest.parent / f".{dest.name}.bak"
    shutil.rmtree(backup, ignore_errors=True)
    dest.rename(backup)
    try:
        src.rename(dest)
    except Exception:
        backup.rename(dest)
        raise
    shutil.rmtree(backup, ignore_errors=True)


# ── ensure_steam_runtime ──────────────────────────────────────────────────────

def ensure_steam_runtime(on_progress=None) -> str | None:
    """Baixar/atualizar Steam Runtime com resume, SHA256 e swap atômico."""
    emit = on_progress or (lambda m: None)
    runtime_dir = Path(STEAM_RUNTIME_DIR)
    entry_point = runtime_dir / "_v2-entry-point"

    # ── Buscar metadados do servidor ──────────────────────────────────────
    try:
        build_id = _fetch_url_text(f"{STEAM_RUNTIME_BASE}/BUILD_ID.txt?t={token_urlsafe(16)}")
        version_data = _fetch_url_text(f"{STEAM_RUNTIME_BASE}/VERSION.txt?t={token_urlsafe(16)}")
        expected_hash = _fetch_sha256()
    except Exception as e:
        emit(f"Não foi possível contactar servidor: {e}")
        if entry_point.is_file() and (runtime_dir / "VERSIONS.txt").is_file():
            emit("Usando runtime existente")
            return str(runtime_dir)
        return None

    if not expected_hash:
        emit("SHA256SUMS não contém hash para o archive")
        return str(runtime_dir) if entry_point.is_file() else None

    # ── Update check ──────────────────────────────────────────────────────
    versions_file = runtime_dir / "VERSIONS.txt"
    if entry_point.is_file() and versions_file.is_file():
        try:
            local_versions = versions_file.read_text()
            if version_data.strip() in local_versions:
                emit("Steam Runtime atualizado")
                return str(runtime_dir)
        except OSError:
            pass
        emit("Nova versão do Steam Runtime disponível. Atualizando...")

    # ── Download com resume ────────────────────────────────────────────────
    cache_dir = Path(STEAM_RUNTIME_CACHE)
    cache_dir.mkdir(parents=True, exist_ok=True)

    archive_name = "SteamLinuxRuntime_4.tar.xz"
    parts_file = cache_dir / f"{archive_name}.{build_id}.parts"
    final_file = cache_dir / f"{archive_name}.{build_id}"

    if not final_file.is_file():
        emit("Baixando Steam Runtime... (~200MB)")
        result = _download_with_resume(parts_file, f"{STEAM_RUNTIME_BASE}/{archive_name}", expected_hash, emit)
        if not result:
            emit("Falha no download do Steam Runtime")
            return str(runtime_dir) if entry_point.is_file() else None
        final_file = result

    # ── Extrair para diretório temporário ─────────────────────────────────
    emit("Extraindo Steam Runtime...")
    temp_dir = runtime_dir.parent / f".{runtime_dir.name}.tmp.{os.getpid()}"
    shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        with tarfile.open(final_file, "r:xz") as tar:
            tar.extractall(path=temp_dir)
    except Exception as e:
        emit(f"Falha ao extrair: {e}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        return str(runtime_dir) if entry_point.is_file() else None

    # ── Aplainar SteamLinuxRuntime_4/ ────────────────────────────────────
    extracted = temp_dir / "SteamLinuxRuntime_4"
    if extracted.is_dir():
        for item in list(extracted.iterdir()):
            shutil.move(str(item), str(temp_dir / item.name))
        extracted.rmdir()

    # ── Validar + pós-instalação ──────────────────────────────────────────
    if not (temp_dir / "_v2-entry-point").is_file():
        emit("_v2-entry-point não encontrado após extração")
        shutil.rmtree(temp_dir, ignore_errors=True)
        return str(runtime_dir) if entry_point.is_file() else None

    _create_shim_and_symlinks(temp_dir)
    (temp_dir / "VERSIONS.txt").write_text(version_data)

    # ── Swap atômico ──────────────────────────────────────────────────────
    runtime_dir.mkdir(parents=True, exist_ok=True)
    _exchange_dirs(temp_dir, runtime_dir)

    emit("Steam Runtime pronto!")
    return str(runtime_dir)


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
    emit = on_progress or (lambda m: None)

    # Garante Steam Runtime instalado antes de criar o prefixo
    ensure_steam_runtime(on_progress=emit)

    resolved = resolve_prefix_path(game_id, prefix_path)
    result = {
        "success": False,
        "prefix_path": resolved,
        "initialized": False,
        "dlls_installed": [],
        "errors": [],
    }

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
