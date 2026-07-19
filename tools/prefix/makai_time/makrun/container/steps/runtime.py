from pathlib import Path
from makrun.container.steps import StepResult
from makrun.log import log


def _resolve_runtime_files(runtime_path: Path) -> Path | None:
    """Resolve o caminho para files/ dentro do runtime (OSTree checkout)."""
    runtime_files = runtime_path / "files"
    if runtime_files.is_dir() and (runtime_files / "usr").is_dir():
        return runtime_files

    for base in (runtime_path, runtime_path.parent):
        var_dir = base / "var"
        if var_dir.is_dir():
            candidates = sorted(
                (d for d in var_dir.glob("tmp-*") if (d / "usr").is_dir()),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if candidates:
                return candidates[0]
    return None


def configure(runtime_path: Path, config: dict) -> tuple[StepResult, Path | None]:
    """Monta o runtime Debian (steamrt4) como rootfs do container."""
    args = []
    runtime_files = _resolve_runtime_files(runtime_path)
    if runtime_files is None:
        raise RuntimeError(f"Runtime has no files/ at {runtime_path}")

    container_cfg = config.get("container", {})
    runtime_mount = container_cfg.get("runtime_mount", "/usr")
    lib_mount = container_cfg.get("lib_mount", "/lib")

    # Runtime /usr
    runtime_usr = runtime_files / "usr"
    args.extend(["--ro-bind", str(runtime_usr), runtime_mount])

    # Libs: tmpfs + binds individuais
    runtime_lib = runtime_files / "lib"
    args.extend(["--tmpfs", lib_mount])

    for _libdir in ["x86_64-linux-gnu", "i386-linux-gnu", "aarch64-linux-gnu"]:
        _src = runtime_lib / _libdir
        if _src.is_dir():
            args.extend(["--ro-bind", str(_src), f"{lib_mount}/{_libdir}"])

    for _entry in sorted(runtime_lib.iterdir()):
        _name = _entry.name
        _dst = Path(lib_mount) / _name
        if _name in ("x86_64-linux-gnu", "i386-linux-gnu", "aarch64-linux-gnu"):
            continue
        if _entry.is_dir():
            args.extend(["--ro-bind", str(_entry), str(_dst)])
        elif _entry.is_file() and not _dst.exists():
            args.extend(["--ro-bind", str(_entry), str(_dst)])

    # Linker symlinks
    if container_cfg.get("linkers", True):
        if (runtime_lib / "i386-linux-gnu" / "ld-linux.so.2").is_file():
            args.extend(["--symlink", "i386-linux-gnu/ld-linux.so.2", "/lib/ld-linux.so.2"])
        args.extend(["--symlink", "lib/x86_64-linux-gnu", "/lib64"])
        if (runtime_lib / "i386-linux-gnu").is_dir():
            args.extend(["--symlink", "lib/i386-linux-gnu", "/lib32"])

    # bin/sbin symlinks
    if container_cfg.get("bin_sbin_symlinks", True):
        for link in ["bin", "sbin"]:
            args.extend(["--symlink", f"usr/{link}", f"/{link}"])

    # ld.so.cache
    if container_cfg.get("ld_so_cache", True):
        _ld_cache = runtime_files / "etc" / "ld.so.cache"
        if _ld_cache.is_file():
            args.extend(["--ro-bind", str(_ld_cache), "/etc/ld.so.cache"])

    # etc/pulse, etc/alsa, etc/openal do runtime (configs nativas)
    runtime_etc = runtime_files / "etc"
    for _etc_dir in ["pulse", "openal", "alsa"]:
        _src = runtime_etc / _etc_dir
        if _src.is_dir():
            args.extend(["--ro-bind", str(_src), f"/etc/{_etc_dir}"])

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary=f"runtime: {runtime_files.name}" if applied else "runtime: skipped",
    ), runtime_files
