"""LD_LIBRARY_PATH construction.

Runtime libs como base, host GPU drivers como overlay,
prefix native libs como maior prioridade.

Ordem de prioridade (maior primeiro):
1. <prefix>/drive_c/windows/system32  (Wine builtin)
2. <overrides>/<arch>/lib              (GPU driver overrides)
3. <runtime>/lib/<arch>-linux-gnu     (steamrt4 libs)
4. Host /usr/lib/<arch>-linux-gnu     (fallback)
"""

import os
import platform


_ARCH_MAP = {
    "x86_64": "x86_64-linux-gnu",
    "i686": "i686-linux-gnu",
    "aarch64": "aarch64-linux-gnu",
}

_runtime_ld_paths = None
_host_ld_paths = None


def _native_arch() -> str:
    return _ARCH_MAP.get(platform.machine(), "x86_64-linux-gnu")


def _i386_arch() -> str:
    return "i386-linux-gnu"


def runtime_paths(runtime_dir: str = None, container_paths: bool = False) -> list[str]:
    if container_paths:
        native = _native_arch()
        i386 = _i386_arch()
        return [f"/runtime/lib/{native}", f"/runtime/lib/{i386}"]

    global _runtime_ld_paths
    if _runtime_ld_paths:
        return _runtime_ld_paths

    native = _native_arch()
    i386 = _i386_arch()

    rt_lib = os.path.join(runtime_dir, "lib")
    if not os.path.isdir(rt_lib):
        rt_lib = os.path.join(runtime_dir, "files", "lib")

    paths = []
    for arch in [native, i386]:
        base = os.path.join(rt_lib, arch)
        if os.path.isdir(base):
            paths.append(base)

    _runtime_ld_paths = paths
    return paths


def host_paths() -> list[str]:
    global _host_ld_paths
    if _host_ld_paths:
        return _host_ld_paths

    native = _native_arch()
    i386 = _i386_arch()

    paths = [
        f"/usr/lib/{native}",
        f"/usr/lib/{i386}",
        "/usr/lib",
        f"/usr/lib64/{native}",
        "/usr/lib64",
        "/lib",
    ]

    _host_ld_paths = paths
    return [p for p in paths if os.path.isdir(p)]


def override_paths(overrides_dir: str = None, container_paths: bool = False) -> list[str]:
    if container_paths:
        native = _native_arch()
        i386 = _i386_arch()
        return [f"/overrides/{native}/lib", f"/overrides/{i386}/lib"]

    native = _native_arch()
    i386 = _i386_arch()

    paths = [
        os.path.join(overrides_dir, native, "lib"),
        os.path.join(overrides_dir, i386, "lib"),
    ]
    return [p for p in paths if os.path.isdir(p)]


def build_ld_library_path(
    prefix_dir: str | None = None,
    overrides_dir: str | None = None,
    runtime_dir: str | None = None,
    include_host: bool = True,
    container_paths: bool = False,
) -> str:
    """Constrói LD_LIBRARY_PATH no formato 'path1:path2:...'.
    
    Prioridade (maior primeiro): prefix > overrides > runtime > host.
    Se container_paths=True, usa paths dentro do container (/overrides/, /lib/).
    """
    parts = []

    if prefix_dir:
        system32 = os.path.join(prefix_dir, "drive_c", "windows", "system32")
        if os.path.isdir(system32):
            parts.append(system32)

    if overrides_dir:
        parts.extend(override_paths(overrides_dir, container_paths=container_paths))

    if runtime_dir:
        parts.extend(runtime_paths(runtime_dir, container_paths=container_paths))

    if include_host:
        for p in host_paths():
            parts.append(p)

    return ":".join(parts)


def regenerate_ld_so_cache(runtime_dir: str, overrides_dir: str) -> str | None:
    """Regenera ld.so.cache com runtime + overrides.
    
    Retorna caminho do cache ou None se falhar.
    """
    import subprocess
    import tempfile

    conf_content = _build_ld_config(runtime_dir, overrides_dir)
    if not conf_content:
        return None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".conf", delete=False, prefix="makai_ld_"
        ) as f:
            f.write(conf_content)
            conf_path = f.name

        cache_path = conf_path + ".cache"
        r = subprocess.run(
            ["ldconfig", "-f", conf_path, "-C", cache_path],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode != 0:
            return None
        return cache_path
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


def _build_ld_config(runtime_dir: str, overrides_dir: str) -> str:
    """Constrói conteúdo de ld.so.conf no estilo:
    /<runtime>/lib/x86_64-linux-gnu
    /<runtime>/lib/i386-linux-gnu
    /<overrides>/x86_64-linux-gnu/lib
    /<overrides>/i386-linux-gnu/lib
    """
    lines = []
    native = _native_arch()
    i386 = _i386_arch()

    paths = [
        os.path.join(runtime_dir, "lib", native),
        os.path.join(runtime_dir, "lib", i386),
        os.path.join(overrides_dir, native, "lib"),
        os.path.join(overrides_dir, i386, "lib"),
    ]

    for p in paths:
        if os.path.isdir(p):
            lines.append(p)

    return "\n".join(lines)
