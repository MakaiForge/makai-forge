"""Steam Runtime download and management.

Baseado no core.py existente (ensure_steam_runtime).
Suporta scout (steamrt1), soldier (steamrt2), sniper (steamrt3), steamrt4.
"""

import hashlib
import os
import tarfile
import urllib.request
import shutil


STEAMRT_REGISTRY = {
    "scout": {
        "base_url": "https://repo.steampowered.com/steamrt-images-scout/snapshots/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-scout-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "1.0.20260525.238139",
    },
    "soldier": {
        "base_url": "https://repo.steampowered.com/steamrt-images-soldier/snapshots/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-soldier-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "2.0.20260602.240809",
    },
    "sniper": {
        "base_url": "https://repo.steampowered.com/steamrt-images-sniper/snapshots/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-sniper-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "3.0.20260608.242788",
    },
    "steamrt4": {
        "base_url": "https://repo.steampowered.com/steamrt4/images/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-steamrt4-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "4.0.20260608.242786",
    },
}


def runtime_dir(base_path: str, name: str = "steamrt4") -> str:
    return os.path.join(base_path, "runtimes", name)


def is_runtime_cached(runtime_path: str) -> bool:
    lib_dir = os.path.join(runtime_path, "lib")
    return os.path.isdir(lib_dir) and len(os.listdir(lib_dir)) > 0


def _search_known_paths(name: str) -> str | None:
    known_bases = [
        os.path.expanduser(f"~/.local/share/{d}")
        for d in ["makaiforge", "umu", "Steam"]
    ]
    for base in known_bases:
        rt_dir = os.path.join(base, name)
        if os.path.isdir(rt_dir):
            for entry in sorted(os.listdir(rt_dir)):
                entry_path = os.path.join(rt_dir, entry)
                if entry.startswith("steamrt") and os.path.isdir(entry_path):
                    files_dir = os.path.join(entry_path, "files")
                    if os.path.isdir(files_dir):
                        return entry_path
                    return entry_path
            if is_runtime_cached(rt_dir):
                return rt_dir
    return None


def _is_casync_format(rt_path: str) -> bool:
    files_dir = os.path.join(rt_path, "files")
    if not os.path.isdir(files_dir):
        return False
    for entry in os.listdir(files_dir):
        if len(entry) == 2 and all(c in "0123456789abcdef" for c in entry.lower()):
            return True
    return False


def find_lib_dir(rt_path: str) -> str | None:
    files_lib = os.path.join(rt_path, "files", "lib")
    if os.path.isdir(files_lib):
        return os.path.join(rt_path, "files")

    direct_lib = os.path.join(rt_path, "lib")
    if os.path.isdir(direct_lib):
        return rt_path

    return None


def _resolve_latest_version(name: str) -> str:
    info = STEAMRT_REGISTRY.get(name)
    if not info:
        return ""
    url = info["base_url"] + info["version_file"]
    try:
        resp = urllib.request.urlopen(url, timeout=10)
        version = resp.read().decode("utf-8").strip()
        if version:
            return version
    except Exception:
        pass
    return ""


def _build_url(name: str) -> str:
    info = STEAMRT_REGISTRY.get(name)
    if not info:
        raise ValueError(f"Runtime desconhecido: {name}")
    version = _resolve_latest_version(name) or info["version"]
    return info["base_url"] + version + "/" + info["tarball"]


def ensure_runtime(
    base_path: str,
    name: str = "steamrt4",
    verbose: bool = False,
) -> str:
    found = _search_known_paths(name)
    if found:
        if verbose:
            print(f"Runtime {name} encontrado em: {found}")
        return found

    rt_dir = runtime_dir(base_path, name)

    if is_runtime_cached(rt_dir):
        if verbose:
            print(f"Runtime {name} já em cache: {rt_dir}")
        return rt_dir

    if name not in STEAMRT_REGISTRY:
        raise ValueError(f"Runtime desconhecido: {name}. Disponíveis: {list(STEAMRT_REGISTRY.keys())}")

    url = _build_url(name)
    tarball_ext = os.path.splitext(url)[1]
    if tarball_ext == ".gz":
        tarball_ext = ".tar.gz"
    tarball = os.path.join(base_path, f"{name}{tarball_ext}")

    os.makedirs(os.path.dirname(rt_dir), exist_ok=True)

    if verbose:
        print(f"Baixando {name} de {url}...")
    _download(url, tarball, verbose)

    if verbose:
        print(f"Extraindo para {rt_dir}...")
    os.makedirs(rt_dir, exist_ok=True)
    _extract_tarball(tarball, rt_dir)

    files_subdir = os.path.join(rt_dir, "files")
    if os.path.isdir(files_subdir) and not os.path.isdir(os.path.join(rt_dir, "lib")):
        is_casync = any(
            len(e) == 2 and all(c in "0123456789abcdef" for c in e.lower())
            for e in os.listdir(files_subdir)
        )
        if not is_casync:
            _merge_files_subdir(files_subdir, rt_dir, verbose)

    if verbose:
        print(f"Runtime {name} pronto: {rt_dir}")

    return rt_dir


def _download(url: str, dest: str, verbose: bool = False):
    def progress(block_count, block_size, total_size):
        if verbose and total_size > 0:
            downloaded = block_count * block_size / (1024 * 1024)
            total_mb = total_size / (1024 * 1024)
            print(f"\r  {downloaded:.1f}/{total_mb:.1f} MB", end="")

    urllib.request.urlretrieve(url, dest, reporthook=progress if verbose else None)
    if verbose:
        print()


def _verify_sha256(filepath: str, expected: str):
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    if sha256.hexdigest() != expected:
        raise ValueError(
            f"Checksum mismatch for {filepath}: "
            f"expected {expected}, got {sha256.hexdigest()}"
        )


def _extract_tarball(tarball: str, dest: str):
    if tarball.endswith(".tar.xz"):
        mode = "r:xz"
    elif tarball.endswith(".tar.gz") or tarball.endswith(".tgz"):
        mode = "r:gz"
    else:
        mode = "r"
    with tarfile.open(tarball, mode) as tar:
        tar.extractall(path=dest)


def _merge_files_subdir(files_dir: str, rt_dir: str, verbose: bool = False):
    for item in os.listdir(files_dir):
        src = os.path.join(files_dir, item)
        dst = os.path.join(rt_dir, item)
        if os.path.exists(dst):
            if verbose:
                print(f"  Aviso: {dst} já existe, ignorando")
            continue
        shutil.move(src, dst)
        if verbose:
            print(f"  Movido: {src} -> {dst}")
    try:
        os.rmdir(files_dir)
    except OSError:
        pass


def list_runtimes(base_path: str) -> list[str]:
    runtimes_dir = os.path.join(base_path, "runtimes")
    if not os.path.isdir(runtimes_dir):
        return []
    return [
        d for d in os.listdir(runtimes_dir)
        if os.path.isdir(os.path.join(runtimes_dir, d))
    ]


def remove_runtime(base_path: str, name: str):
    rt_dir = runtime_dir(base_path, name)
    if os.path.isdir(rt_dir):
        shutil.rmtree(rt_dir)
