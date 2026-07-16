"""capsule-capture-libs — Captura libs GPU como cópia auto-contida.

Usa ldconfig -p para encontrar libs rapidamente em vez de os.walk.
Resolve dependências recursivamente com readelf.
Cria um diretório com a estrutura /usr/lib/<arch>/ para montagem.
"""

import os
import re
import shutil
import subprocess


_LDCONFIG_CACHE: dict[str, str] | None = None


def _ldconfig_cache() -> dict[str, str]:
    global _LDCONFIG_CACHE
    if _LDCONFIG_CACHE is not None:
        return _LDCONFIG_CACHE
    cache = {}
    try:
        r = subprocess.run(
            ["ldconfig", "-p"], capture_output=True, text=True, timeout=15,
        )
        for line in r.stdout.splitlines():
            m = re.match(r"^\s+(\S+)\s+\(.*\)\s+=>\s+(\S+)", line)
            if m:
                cache[m.group(1)] = m.group(2)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    _LDCONFIG_CACHE = cache
    return cache


def _readelf_needed(lib_path: str) -> list[str]:
    try:
        r = subprocess.run(
            ["readelf", "-d", lib_path],
            capture_output=True, text=True, timeout=10,
        )
        return [line.split("[")[1].split("]")[0]
                for line in r.stdout.splitlines() if "NEEDED" in line and "[" in line]
    except (FileNotFoundError, subprocess.TimeoutExpired, IndexError):
        return []


def _resolve_recursive(
    names: list[str],
    resolved: set[str],
    depth: int = 0,
):
    if depth > 8:
        return
    cache = _ldconfig_cache()
    for name in names:
        # If it's an absolute path, use it directly
        if name.startswith("/"):
            path = name
        else:
            path = cache.get(name)

        if not path or not os.path.isfile(path) or path in resolved:
            continue

        # Resolve symlinks to get the real file
        real = os.path.realpath(path)
        if real != path:
            resolved.add(real)
            needed = _readelf_needed(real)
            _resolve_recursive(needed, resolved, depth + 1)

        resolved.add(path)
        needed = _readelf_needed(path)
        _resolve_recursive(needed, resolved, depth + 1)


def capsule_capture(
    host_libs: list[str],
    capsule_dir: str,
    search_paths: list[str] | None = None,
    verbose: bool = False,
) -> int:
    resolved: set[str] = set()
    _resolve_recursive(host_libs, resolved)

    essential = ["libc.so.6", "libstdc++.so.6", "libpthread.so.0",
                 "libdl.so.2", "libm.so.6", "librt.so.1", "libgcc_s.so.1"]
    _resolve_recursive(essential, resolved)

    copied = 0
    for src in sorted(resolved):
        if not os.path.isfile(src):
            continue
        rel = os.path.relpath(src, "/").lstrip("/")
        dst = os.path.join(capsule_dir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            shutil.copy2(src, dst)
            copied += 1
        except OSError:
            pass

    if verbose:
        print(f"  Capsule: {copied} libs copiadas para {capsule_dir}")

    return copied


def capsule_bwrap_args(capsule_dir: str) -> list[str]:
    args = []
    for sub in ["/usr/lib/x86_64-linux-gnu", "/usr/lib/i386-linux-gnu",
                "/usr/lib", "/usr/lib64", "/lib", "/lib64"]:
        path = os.path.join(capsule_dir, sub.lstrip("/"))
        if os.path.isdir(path):
            args.extend(["--ro-bind", path, sub])
    return args
