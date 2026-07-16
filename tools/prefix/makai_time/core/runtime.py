"""Steam Runtime download and management (rebranded to Makai Libs).

Os runtimes são pacotes .deb do Debian extraídos (open source).
O rebrand remove as referências a Steam e renomeia para Makai Libs.
"""

import fcntl
import hashlib
import os
import shutil
import tarfile
import time
import urllib.request

from makai_time.core.rebrand import rebrand
import shutil


STEAMRT_FALLBACK_CHAIN = ["scout", "soldier", "sniper", "steamrt4"]


STEAMRT_REGISTRY = {
    "steamrt4": {
        "base_url": "https://repo.steampowered.com/steamrt4/images/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-steamrt4-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "4.0.20260608.242786",
        "rebrand": True,
    },
    "sniper": {
        "base_url": "https://repo.steampowered.com/steamrt-images-sniper/snapshots/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-sniper-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "3.0.20260608.242788",
        "rebrand": True,
    },
    "soldier": {
        "base_url": "https://repo.steampowered.com/steamrt-images-soldier/snapshots/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-soldier-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "2.0.20260602.240809",
        "rebrand": True,
    },
    "scout": {
        "base_url": "https://repo.steampowered.com/steamrt-images-scout/snapshots/",
        "tarball": "com.valvesoftware.SteamRuntime.Platform-amd64,i386-scout-runtime.tar.gz",
        "version_file": "latest-public-stable.txt",
        "version": "1.0.20260525.238139",
        "rebrand": True,
    },
}

MAKAI_RUNTIME_URLS = {
    "steamrt4": [
        "https://github.com/MakaiForge/makai-runtime/releases/download/v1.0/makai-runtime-1.0.tar.gz",
        "https://gitlab.com/makaiforger/makai-runtime/-/releases/v1.0/makai-runtime-1.0.tar.gz",
        "https://download1979.mediafire.com/wphqjcq9heigXlA-Yq2B0Esx786GNZr23ogNjYC6VFC0AGRDbmzJu83oLu6QLbGlb4io5QbZ1X30FKQZLrx1TVXIg5A5Yyv8zxcE2ukl12rvnGmALa_1DO56xDugJNPEsUjJP37lDbmKGqJR2cMpQaXL9cyaX3rAzG1vQIVPZVvOug/cesuqq5hh23f1gj/makai-runtime-1.0.tar.gz",
    ],
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
    names_to_try = [name, name.replace("steamrt", "makairt").replace("makairt4", "makairt")]
    for base in known_bases:
        for n in names_to_try:
            rt_dir = os.path.join(base, n)
            if os.path.isdir(rt_dir):
                for entry in sorted(os.listdir(rt_dir)):
                    entry_path = os.path.join(rt_dir, entry)
                    if entry.startswith(("steamrt", "makairt")) and os.path.isdir(entry_path):
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


def _build_urls(name: str) -> list[str]:
    if name in MAKAI_RUNTIME_URLS:
        return list(MAKAI_RUNTIME_URLS[name])
    info = STEAMRT_REGISTRY.get(name)
    if not info:
        raise ValueError(f"Runtime desconhecido: {name}")
    version = _resolve_latest_version(name) or info["version"]
    return [info["base_url"] + version + "/" + info["tarball"]]


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

    if name not in MAKAI_RUNTIME_URLS and name not in STEAMRT_REGISTRY:
        raise ValueError(f"Runtime desconhecido: {name}")

    urls = _build_urls(name)
    tarball_ext = ".tar.gz"
    tarball = os.path.join(base_path, f"{name}{tarball_ext}")

    os.makedirs(os.path.dirname(rt_dir), exist_ok=True)

    last_error = None
    for url in urls:
        if verbose:
            print(f"Baixando {name} de {url}...")
        try:
            _download(url, tarball, verbose)
            last_error = None
            break
        except Exception as e:
            last_error = e
            if verbose:
                print(f"  Falha: {e}. Tentando próximo mirror...")
            continue

    if last_error:
        raise RuntimeError(
            f"Falha ao baixar runtime {name} de {len(urls)} mirror(s): {last_error}"
        )

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

    info = STEAMRT_REGISTRY.get(name, {})
    if info.get("rebrand"):
        rebrand(rt_dir, verbose=verbose)

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


def make_mutable_copy(
    rt_path: str, verbose: bool = False,
) -> str | None:
    """Copia runtime para diretório mutável (necessário para FEX-Emu).

    FEX-Emu precisa de permissão de escrita no runtime para aplicar
    traduções ARM→x86. O runtime original é --ro-bind. Esta função
    cria uma cópia que pode ser montada com --bind (writable).
    """
    mutable_dir = rt_path + ".mutable"
    if os.path.isdir(mutable_dir):
        if verbose:
            print(f"  Cópia mutável já existe: {mutable_dir}")
        return mutable_dir

    if verbose:
        print(f"  Criando cópia mutável do runtime em {mutable_dir}...")
    try:
        shutil.copytree(rt_path, mutable_dir, symlinks=True, ignore_dangling_symlinks=True)
        if verbose:
            print(f"  Cópia mutável pronta: {mutable_dir}")
        return mutable_dir
    except Exception as e:
        if verbose:
            print(f"  Erro ao criar cópia mutável: {e}")
        return None


# ── Garbage Collection ─────────────────────────────────────────────────────


def acquire_ref_lock(ref_path: str, timeout: float = 5.0) -> int | None:
    os.makedirs(os.path.dirname(ref_path), exist_ok=True)
    try:
        fd = os.open(ref_path, os.O_CREAT | os.O_RDWR, 0o644)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return fd
            except BlockingIOError:
                time.sleep(0.1)
        os.close(fd)
        return None
    except OSError:
        return None


def release_ref_lock(fd: int):
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
    except OSError:
        pass


def garbage_collect(
    base_path: str,
    max_age_days: int = 30,
    verbose: bool = False,
) -> list[str]:
    runtimes_dir = os.path.join(base_path, "runtimes")
    if not os.path.isdir(runtimes_dir):
        return []

    removed = []
    now = time.time()
    for entry in sorted(os.listdir(runtimes_dir)):
        rt_dir = os.path.join(runtimes_dir, entry)
        if not os.path.isdir(rt_dir):
            continue

        ref_path = os.path.join(rt_dir, ".ref")
        fd = None
        try:
            fd = os.open(ref_path, os.O_RDONLY)
            if fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB):
                age_days = (now - os.path.getmtime(ref_path)) / 86400
                if age_days >= max_age_days:
                    if verbose:
                        print(f"  Removendo runtime antigo: {entry} ({age_days:.0f}d)")
                    shutil.rmtree(rt_dir)
                    removed.append(entry)
                else:
                    os.utime(ref_path, None)
        except (BlockingIOError, OSError):
            pass
        finally:
            if fd is not None:
                try:
                    fcntl.flock(fd, fcntl.LOCK_UN)
                    os.close(fd)
                except OSError:
                    pass

    return removed


def resolve_runtime_chain(
    base_path: str,
    preferred: str | None = None,
    verbose: bool = False,
) -> tuple[str | None, str | None]:
    if preferred and (preferred in MAKAI_RUNTIME_URLS or preferred in STEAMRT_REGISTRY):
        found = _search_known_paths(preferred) or (
            is_runtime_cached(runtime_dir(base_path, preferred))
            and runtime_dir(base_path, preferred)
        )
        if found:
            if verbose:
                print(f"  Runtime {preferred} encontrado em cache: {found}")
            return found, preferred
        if verbose:
            print(f"  Runtime {preferred} exigido pelo perfil mas nao em cache — baixando...")
        try:
            rt_path = ensure_runtime(base_path, preferred, verbose=verbose)
            return rt_path, preferred
        except Exception as e:
            raise RuntimeError(
                f"Runtime {preferred} exigido pelo perfil mas falhou ao baixar: {e}"
            )

    default = "steamrt4"
    found = _search_known_paths(default) or (
        is_runtime_cached(runtime_dir(base_path, default))
        and runtime_dir(base_path, default)
    )
    if found:
        if verbose:
            print(f"  Runtime {default} encontrado em cache: {found}")
        return found, default

    if verbose:
        print(f"  Nenhum runtime em cache. Usando libs do host.")
        print(f"  (Baixe com: python3 -m makai_time.makai_time --download-runtime)")

    return None, None
