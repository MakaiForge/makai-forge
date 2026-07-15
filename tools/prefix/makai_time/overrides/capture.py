"""Cria diretório de overrides GPU com symlinks para as libs do host.

Estratégia: ao invés de montar /usr/lib64 inteiro no container,
criamos um diretório de overrides com symlinks APENAS para as
bibliotecas GPU necessárias. Isso reduz:
- Superfície de ataque do container
- Conflitos de libc entre runtime e host
- Overhead de memória (menos inodes montados)

Inspirado em pressure-vessel: SrtGraphicsProvider + capsule-capture-libs.
Mas usando symlinks em vez de cópia (mais rápido, sem desperdício de disco).
"""

import os
import shutil


def ensure_overrides_dir(overrides_base: str, arch: str = "x86_64-linux-gnu") -> str:
    """Garante que o diretório de overrides existe.
    
    Creates: <overrides_base>/<arch>/lib/
    """
    lib_dir = os.path.join(overrides_base, arch, "lib")
    os.makedirs(lib_dir, exist_ok=True)
    return lib_dir


def symlink_library(
    host_path: str, override_lib_dir: str, verbose: bool = False
) -> str | None:
    """Cria symlink de uma lib do host no diretório de overrides.
    
    Returns: caminho do symlink criado ou None se falhar.
    """
    if not os.path.isfile(host_path) and not os.path.islink(host_path):
        return None

    basename = os.path.basename(host_path)
    link_path = os.path.join(override_lib_dir, basename)

    if os.path.exists(link_path):
        return link_path

    try:
        os.symlink(host_path, link_path)
        if verbose:
            print(f"  symlink: {link_path} -> {host_path}")
        return link_path
    except OSError:
        return None


def symlink_vulkan_icd(
    json_path: str, override_lib_dir: str, override_data_dir: str, verbose: bool = False
) -> str | None:
    """Copia/symlink ICD JSON para os overrides.
    
    O pressure-vessel copia o JSON e ajusta library_path.
    Fazemos o mesmo: criamos o JSON no override apontando para o symlink.
    """
    import json

    if not os.path.isfile(json_path):
        return None

    try:
        with open(json_path) as f:
            data = json.load(f)

        lib_path = data.get("ICD", {}).get("library_path", "")
        if not lib_path:
            return None

        lib_basename = os.path.basename(lib_path)
        symlink_path = os.path.join(override_lib_dir, lib_basename)

        if not os.path.exists(symlink_path):
            if os.path.isabs(lib_path) and os.path.exists(lib_path):
                os.symlink(lib_path, symlink_path)
            else:
                from makai_time.overrides.detect import _find_lib
                found = _find_lib(lib_basename)
                if found:
                    os.symlink(found, symlink_path)
                else:
                    return None

        icd_dir = os.path.join(override_data_dir, "vulkan", "icd.d")
        os.makedirs(icd_dir, exist_ok=True)

        data["ICD"]["library_path"] = os.path.join("/overrides", arch, "lib", lib_basename)

        json_out = os.path.join(icd_dir, os.path.basename(json_path))
        with open(json_out, "w") as f:
            json.dump(data, f, indent=2)

        if verbose:
            print(f"  icd json: {json_out} -> lib {data['ICD']['library_path']}")

        return json_out
    except (json.JSONDecodeError, OSError):
        return None


def capture_vulkan_icds(
    overrides_base: str,
    arch: str = "x86_64-linux-gnu",
    verbose: bool = False,
) -> list[str]:
    """Captura todos os ICDs Vulkan para overrides.
    
    Returns: lista de JSONs criados.
    """
    from makai_time.overrides.detect import vulkan_icds

    lib_dir = ensure_overrides_dir(overrides_base, arch)
    data_dir = os.path.join(overrides_base, "share")

    created = []
    for icd in vulkan_icds():
        if icd["lib_path"]:
            symlink_library(icd["lib_path"], lib_dir, verbose)
        result = symlink_vulkan_icd(icd["json_path"], lib_dir, data_dir, verbose)
        if result:
            created.append(result)

    return created


def capture_all_graphics(
    overrides_base: str,
    arch: str = "x86_64-linux-gnu",
    verbose: bool = False,
    skip_nvidia: bool = False,
) -> int:
    """Captura todas as bibliotecas gráficas detectadas para overrides.

    Args:
        skip_nvidia: Se True, pula libs NVIDIA (útil quando o Proton
                     já embarca libnvidia-* bundled, ex: CachyOS, DW-Proton).

    Returns: número de symlinks criados.
    """
    from makai_time.overrides.detect import (
        all_graphics_libraries, nvidia_libs, gl_drivers, vulkan_icds,
    )

    lib_dir = ensure_overrides_dir(overrides_base, arch)
    all_libs = all_graphics_libraries()

    if skip_nvidia:
        nv_set = set(nvidia_libs())
        gl = gl_drivers()
        nv_gl = {v for k, v in gl.items() if v and "nvidia" in k.lower()}
        skip_set = nv_set | nv_gl

        filtered = [l for l in all_libs if l not in skip_set]
        nv_count = len(all_libs) - len(filtered)
        if verbose and nv_count:
            print(f"  Skipping {nv_count} NVIDIA libs (bundled no Proton detected)")

        # Também pular ICDs NVIDIA
        captured_icds = _capture_non_nvidia_icds(overrides_base, arch, verbose)
    else:
        filtered = all_libs
        capture_vulkan_icds(overrides_base, arch, verbose)

    count = 0
    for lib in filtered:
        if symlink_library(lib, lib_dir, verbose):
            count += 1

    if verbose:
        print(f"  Total: {count} symlinks criados")

    return count


def _capture_non_nvidia_icds(
    overrides_base: str,
    arch: str = "x86_64-linux-gnu",
    verbose: bool = False,
) -> list[str]:
    """Captura ICDs Vulkan não-NVIDIA (Mesa, Intel)."""
    from makai_time.overrides.detect import vulkan_icds

    lib_dir = ensure_overrides_dir(overrides_base, arch)
    data_dir = os.path.join(overrides_base, "share")

    created = []
    for icd in vulkan_icds():
        if icd["vendor"] == "nvidia":
            continue
        if icd["lib_path"]:
            symlink_library(icd["lib_path"], lib_dir, verbose)
        result = symlink_vulkan_icd(icd["json_path"], lib_dir, data_dir, verbose)
        if result:
            created.append(result)

    return created


def clean_overrides(overrides_base: str):
    """Remove diretório de overrides."""
    if os.path.isdir(overrides_base):
        shutil.rmtree(overrides_base)
