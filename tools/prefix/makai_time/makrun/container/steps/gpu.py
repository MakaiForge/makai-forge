import os
from pathlib import Path
from makrun.container.steps import StepResult
from makrun.log import log


def _collect_nvidia_so(path: Path, prefixes: tuple[str, ...]) -> list[tuple[Path, bool]]:
    items = []
    if not path.is_dir():
        return items
    for p in path.iterdir():
        if not any(p.name.startswith(prefix) for prefix in prefixes):
            continue
        if p.name.endswith(".so") or ".so." in p.name:
            items.append((p, p.is_symlink()))
    return items


def _add_nvidia_bind(args: list[str], items: list[tuple[Path, bool]],
                     overrides_dir: str) -> None:
    real_files: dict[str, Path] = {}
    symlinks: list[tuple[str, str]] = []

    for p, is_sym in items:
        if is_sym:
            target = os.readlink(str(p))
            if not target.startswith("/"):
                target = str(p.parent / target)
            target = os.path.realpath(target)
            real_dest = os.path.basename(target)
            symlinks.append((real_dest, p.name))
        else:
            real_files[p.name] = p

    for fname, fpath in real_files.items():
        args.extend(["--ro-bind", str(fpath), f"{overrides_dir}/{fname}"])
    for target, link_name in symlinks:
        args.extend(["--symlink", target, f"{overrides_dir}/{link_name}"])


def _detect_vk_icd() -> str | None:
    p = Path("/usr/share/vulkan/icd.d/nvidia_icd.json")
    if p.is_file():
        return str(p)
    return None


def _detect_vk_layers() -> tuple[str | None, str | None]:
    implicit = Path("/usr/share/vulkan/implicit_layer.d")
    explicit = Path("/usr/share/vulkan/explicit_layer.d")
    return (
        str(implicit) if implicit.is_dir() else None,
        str(explicit) if explicit.is_dir() else None,
    )


def _detect_egl_vendor() -> str | None:
    p = Path("/usr/share/glvnd/egl_vendor.d")
    return str(p) if p.is_dir() else None


def _detect_dri() -> str | None:
    p = Path("/usr/lib/dri")
    return str(p) if p.is_dir() else None


def _detect_gbm() -> str | None:
    p = Path("/usr/lib/gbm")
    return str(p) if p.is_dir() else None


def configure(config: dict) -> StepResult:
    """Overrides GPU + ICDs + EGL."""
    args = []
    gpu_cfg = config.get("gpu", {})

    # Provider mount (precisa existir para os paths /run/host)
    # Os paths são resolvidos em /run/host/... (montado em mounts.py)

    skip_nvidia = gpu_cfg.get("skip_nvidia_overrides", False)
    vendor = gpu_cfg.get("vendor", "auto")

    nvidia_prefixes = (
        "libnvidia", "libcuda", "libEGL_nvidia", "libGLX_nvidia",
        "libGLES", "libvdpau_nvidia", "libnvcuvid", "libcudadebugger",
    )

    if vendor == "nvidia" and not skip_nvidia:
        wine_arch = config.get("wine_arch", ["x86_64", "i386"])
        has_x86_64 = any(a in ("x86_64", "win64") for a in wine_arch)
        has_i386 = any(a in ("i386", "win32") for a in wine_arch)

        if has_x86_64:
            items = _collect_nvidia_so(Path("/usr/lib"), nvidia_prefixes)
            if items:
                args.extend(["--tmpfs", "/overrides"])
                args.extend(["--tmpfs", "/overrides/lib"])
                _add_nvidia_bind(args, items, "/overrides/lib")

        if has_i386:
            items = _collect_nvidia_so(Path("/usr/lib32"), nvidia_prefixes)
            if items:
                if not any(a.startswith("--tmpfs") and "/overrides" in a for a in args):
                    args.extend(["--tmpfs", "/overrides"])
                args.extend(["--tmpfs", "/overrides/lib32"])
                _add_nvidia_bind(args, items, "/overrides/lib32")

    applied = len(args) > 0

    # Guarda paths detectados para o step env.py usar
    gpu_info = {
        "vk_icd": _detect_vk_icd(),
        "vk_implicit": _detect_vk_layers()[0],
        "vk_explicit": _detect_vk_layers()[1],
        "egl_vendor": _detect_egl_vendor(),
        "dri_path": _detect_dri(),
        "gbm_path": _detect_gbm(),
        "skip_nvidia": skip_nvidia,
    }

    summary_parts = []
    if skip_nvidia:
        summary_parts.append("nvidia_overrides=skip (bundled)")
    elif applied:
        summary_parts.append("nvidia_overrides=applied")
    else:
        summary_parts.append("nvidia_overrides=none")

    return StepResult(
        args=args,
        applied=applied,
        summary=f"gpu: {', '.join(summary_parts)}",
        extra={"gpu_info": gpu_info},
    )
