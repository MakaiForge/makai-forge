"""
Makaitricks/DLL management for Wine prefixes.

Unified module at tools/prefix/python/prefix/makaitricks.py.

Re-exported by:
  - tools/python-rpc/protonforge-api/api/services/prefix/
  - data/install-api/proton_recommended/python/api/services/prefix/
"""

import os
import re
import stat
import subprocess
import urllib.request

_INSTALL_API_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), *([".."] * 4), "data", "install-api")
)

_MAKAITRICKS_REPO = "https://raw.githubusercontent.com/MakaiForge/Makaitricks/v2025.1"


def _get_local_version(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^WINETRICKS_VERSION=(\S+)", line)
                if m:
                    return m.group(1)
    except Exception:
        pass
    return None


def _check_makaitricks_update(path: str) -> str:
    local_ver = _get_local_version(path)
    if local_ver is None:
        return path
    try:
        req = urllib.request.Request(f"{_MAKAITRICKS_REPO}/LATEST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            remote_ver = resp.read().decode("utf-8").strip()
        if remote_ver and remote_ver != local_ver:
            tmp = path + ".tmp"
            urllib.request.urlretrieve(f"{_MAKAITRICKS_REPO}/Makaitricks", tmp)
            st = os.stat(tmp)
            os.chmod(tmp, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
            os.replace(tmp, path)
    except Exception:
        pass
    st = os.stat(path)
    if not (st.st_mode & stat.S_IXUSR):
        os.chmod(path, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return path


def _ensure_makaitricks(proton_path: str) -> str | None:
    makaitricks_path = os.path.join(_INSTALL_API_DIR, "Makaitricks")
    if os.path.exists(makaitricks_path):
        return _check_makaitricks_update(makaitricks_path)

    # Download Makaitricks if not present locally
    try:
        os.makedirs(os.path.dirname(makaitricks_path), exist_ok=True)
        urllib.request.urlretrieve(
            f"{_MAKAITRICKS_REPO}/Makaitricks",
            makaitricks_path,
        )
        st = os.stat(makaitricks_path)
        os.chmod(makaitricks_path, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
        return makaitricks_path
    except Exception:
        return None


def _check_dll_installed(verb: str, drive_c: str) -> bool:
    system32 = os.path.join(drive_c, "windows", "system32")
    if not os.path.isdir(system32):
        return False

    dll_map = {
        "vcrun2022": ["vcruntime140.dll", "msvcp140.dll"],
        "d3dcompiler_47": ["d3dcompiler_47.dll"],
        "xact": ["xaudio2_7.dll", "xaudio2_8.dll"],
        "mf": ["mfplat.dll"],
        "d3dx9": ["d3dx9_43.dll"],
        "dotnet48": [],
        "dotnetdesktop8": [],
    }

    expected = dll_map.get(verb)
    if expected is None:
        return False
    if not expected:
        return True
    return any(os.path.isfile(os.path.join(system32, dll)) for dll in expected)


def run_makaitricks(
    proton_path: str,
    prefix_path: str,
    verb: str,
    makaitricks_bin: str | None = None,
) -> tuple[bool, str]:
    """Install a single winetricks verb into the prefix."""
    prefix_path = os.path.abspath(os.path.expanduser(prefix_path))
    env = os.environ.copy()
    env["WINEPREFIX"] = prefix_path
    env["WINEARCH"] = "win64"

    if makaitricks_bin is None:
        makaitricks_bin = _ensure_makaitricks(proton_path)

    if makaitricks_bin and makaitricks_bin != "proton":
        try:
            result = subprocess.run(
                [makaitricks_bin, "-q", verb],
                env=env, capture_output=True, text=True, timeout=600,
            )
            if result.returncode == 0:
                return True, ""
            drive_c = os.path.join(prefix_path, "drive_c")
            if _check_dll_installed(verb, drive_c):
                return True, ""
            return False, result.stderr[:200]
        except subprocess.TimeoutExpired:
            return False, "winetricks timed out"
        except FileNotFoundError:
            pass

    if makaitricks_bin == "proton":
        proton_bin = os.path.join(proton_path, "proton")
        if os.path.isfile(proton_bin):
            try:
                result = subprocess.run(
                    [proton_bin, "run", "winetricks", "-q", verb],
                    env={**env, "STEAM_COMPAT_DATA_PATH": prefix_path},
                    capture_output=True, text=True, timeout=600,
                )
                return result.returncode == 0, result.stderr[:200]
            except subprocess.TimeoutExpired:
                return False, "winetricks via proton timed out"

    return False, "winetricks not found in system or proton"


def install_recommended_dlls(
    game_id: str,
    prefix_path: str,
    proton_path: str,
    extra_verbs: list[str] | None = None,
    makaitricks_bin: str | None = None,
) -> dict:
    """Install DLL verbs into prefix, skipping already-installed ones."""
    prefix_path = os.path.abspath(os.path.expanduser(prefix_path))
    verbs = extra_verbs or []
    if not verbs:
        return {"installed": [], "errors": []}

    result = {"installed": [], "errors": []}
    drive_c = os.path.join(prefix_path, "drive_c")

    for verb in verbs:
        if _check_dll_installed(verb, drive_c):
            result["installed"].append(verb)
            continue
        success, error = run_makaitricks(proton_path, prefix_path, verb, makaitricks_bin)
        if success:
            result["installed"].append(verb)
        else:
            result["errors"].append(f"Failed to install {verb}: {error}")

    return result


def run_makaitricks_verbs(
    prefix_path: str,
    proton_path: str,
    verbs: list[str],
    makaitricks_bin: str | None = None,
) -> dict:
    """Run arbitrary winetricks verbs (for external use)."""
    return install_recommended_dlls("", prefix_path, proton_path, verbs, makaitricks_bin)
