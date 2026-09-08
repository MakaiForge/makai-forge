import json
import os
import subprocess
from pathlib import Path
from engine.container.steps import StepResult
from engine.log import log


def _resolve_lib_on_host(soname: str) -> str | None:
    """Resolve um soname no ldconfig do host."""
    try:
        r = subprocess.run(
            ["ldconfig", "-p"],
            capture_output=True, text=True, timeout=5,
        )
        for line in r.stdout.split("\n"):
            line = line.strip()
            if " => " not in line:
                continue
            lib_part, path_part = line.split(" => ", 1)
            # lib_part: "libGLX_nvidia.so.0 (libc6,x86-64)"
            # queremos que COMECE com o soname (seguido de espaço ou fim)
            if lib_part == soname or lib_part.startswith(soname + " "):
                return path_part.strip()
    except Exception:
        pass
    return None


def _ensure_lib_override(args: list[str], lib_path: str,
                         overrides_dir: str) -> str | None:
    """Cria symlink da lib GPU do host em overrides.

    Args:
        lib_path: library_path do JSON (pode ser relativo ou absoluto)
        overrides_dir: /overrides/lib ou /overrides/lib32

    Returns:
        Path do symlink criado, ou None se não achou a lib
    """
    if lib_path.startswith("/"):
        host_path = Path(lib_path)
        if not host_path.exists():
            log.debug("GPU lib (abs) não encontrada no host: %s", lib_path)
            return None
        lib_name = host_path.name
        # --symlink para /run/host/... (path só existe dentro do container)
        args.extend(["--symlink", f"/run/host{lib_path}", f"{overrides_dir}/{lib_name}"])
        return f"{overrides_dir}/{lib_name}"

    # Relative library_path (e.g. "libGLX_nvidia.so.0") — resolve via ldconfig
    resolved = _resolve_lib_on_host(lib_path)
    if not resolved:
        log.debug("GPU lib (rel) não encontrada no ldconfig: %s", lib_path)
        return None

    lib_name = Path(lib_path).name
    # --symlink para /run/host/<realpath> (path só existe dentro do container)
    args.extend(["--symlink", f"/run/host{resolved}", f"{overrides_dir}/{lib_name}"])
    return f"{overrides_dir}/{lib_name}"


def _rewrite_gpu_json(args: list[str], host_json: Path,
                      overrides_dir: str,
                      lib_key: str = "library_path") -> str | None:
    """Lê JSON ICD/EGL do host, reescreve library_path e monta em /overrides/.

    O JSON reescrito é montado em /overrides/share/<relative_path> em vez
    do path original, porque /usr/ é read-only no container (runtime) e
    pode não ter os diretórios pai. /overrides/ é tmpfs (writable), então
    bwrap consegue criar os subdiretórios.

    Retorna o path de montagem dentro do container, ou None se falhou.
    """
    try:
        raw = host_json.read_text()
        data = json.loads(raw)
    except Exception as e:
        log.debug("Erro ao ler %s: %s", host_json, e)
        return None

    icd = data.get("ICD") or data.get("icd") or {}
    lib_key_actual = lib_key if lib_key in icd else "library_path"
    lib_val = icd.get(lib_key_actual)

    if not lib_val:
        return None

    new_path = _ensure_lib_override(args, lib_val, overrides_dir)
    if not new_path:
        return None

    icd[lib_key_actual] = new_path
    data["ICD"] = icd

    # Monta em /overrides/share/<path_relativo> em vez do path original
    # Ex: /usr/share/vulkan/icd.d/nvidia_icd.json → /overrides/share/vulkan/icd.d/nvidia_icd.json
    container_path = f"/overrides/share/{host_json.relative_to('/usr/share')}"
    tmp_json = Path(f"/tmp/.makrun-{host_json.name}")
    tmp_json.write_text(json.dumps(data, indent=2))
    args.extend(["--ro-bind", str(tmp_json), container_path])
    return container_path


def _ensure_host_gpu_libs(args: list[str]) -> dict:
    """Garante que libs GPU do host sejam acessíveis no container.

    Apenas adiciona symlinks e ro-bind a args. NÃO cria --tmpfs
    para o /overrides — quem chama (configure()) decide quando
    criar o tmpfs, para evitar duplicação com o bloco nvidia.

    Pipeline:
      1. Lê todos os JSONs ICD Vulkan do HOST (path real, não em /run/host)
      2. Lê todos os JSONs EGL vendor do HOST
      3. Para cada um, extrai library_path
      4. Se a lib não está no runtime, cria symlink em /overrides/lib/
         apontando para /run/host/<realpath>
      5. Re-escreve o JSON com o path do symlink
      6. Monta o JSON reescrito via --ro-bind no mesmo path do container
    """
    result = {
        "icd_rewritten": 0,
        "egl_rewritten": 0,
        # env.py espera caminho de ARQUIVO para vk_icd
        "icd_overrides_path": None,
        # env.py espera caminho de DIRETÓRIO para egl_vendor
        "egl_overrides_dir": None,
    }
    overrides_dir = "/overrides/lib"

    icd_dirs = [
        Path("/usr/share/vulkan/icd.d"),
    ]
    egl_dirs = [
        Path("/usr/share/glvnd/egl_vendor.d"),
    ]

    for icd_dir in icd_dirs:
        if not icd_dir.is_dir():
            continue
        for host_json in sorted(icd_dir.glob("*.json")):
            mount_path = _rewrite_gpu_json(args, host_json, overrides_dir)
            if mount_path:
                result["icd_rewritten"] += 1
                # Guarda o primeiro path de ICD para env vars
                if result["icd_overrides_path"] is None:
                    result["icd_overrides_path"] = mount_path

    for egl_dir in egl_dirs:
        if not egl_dir.is_dir():
            continue
        for host_json in sorted(egl_dir.glob("*.json")):
            mount_path = _rewrite_gpu_json(args, host_json, overrides_dir)
            if mount_path:
                result["egl_rewritten"] += 1
                # Guarda o diretório base dos EGL overrides (env.py espera dir)
                result["egl_overrides_dir"] = str(
                    Path(mount_path).parent
                )

    return result


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


def _has_dest(args: list[str], dest: str) -> bool:
    """Verifica se dest já tem --ro-bind ou --symlink contido."""
    for i, a in enumerate(args):
        if a in ("--ro-bind", "--symlink") and i + 2 < len(args) and args[i + 2] == dest:
            return True
    return False


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
        dest = f"{overrides_dir}/{fname}"
        if not _has_dest(args, dest):
            args.extend(["--ro-bind", str(fpath), dest])
    for target, link_name in symlinks:
        dest = f"{overrides_dir}/{link_name}"
        if _has_dest(args, dest):
            log.debug("GPU: pulando --symlink conflitante: %s → %s (já existe)", target, dest)
        else:
            args.extend(["--symlink", target, dest])


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


def configure(config: dict, capsule_manifest=None) -> StepResult:
    """Overrides GPU + ICDs + EGL.

    Se capsule_manifest for fornecido (do container auxiliar),
    usa os overrides detectados DENTRO do container em vez de
    detectar do host via ldconfig.

    Args:
        config: Config do fork (gpu, devices, etc.)
        capsule_manifest: GPUManifest do capsule.capture_gpu_libs()
    """
    args = []
    gpu_cfg = config.get("gpu", {})

    if capsule_manifest is not None:
        return _configure_from_capsule(args, config, capsule_manifest)

    # PASSO 1: Garantir que libs GPU do host sejam acessíveis
    # Lê os JSONs ICD/EGL, reescreve library_path para /overrides/lib/
    # e cria symlinks das libs reais apontando para /run/host/<path>
    # Isso funciona independente de skip_nvidia_overrides.
    icd_result = _ensure_host_gpu_libs(args)
    icd_needs_overrides = icd_result.get("icd_rewritten", 0) > 0 or \
        icd_result.get("egl_rewritten", 0) > 0
    if icd_result.get("icd_rewritten", 0) > 0:
        log.info("GPU: %d ICD(s) Vulkan reescritos com paths do host",
                 icd_result["icd_rewritten"])
    if icd_result.get("egl_rewritten", 0) > 0:
        log.info("GPU: %d config(s) EGL reescritas com paths do host",
                 icd_result["egl_rewritten"])

    skip_nvidia = gpu_cfg.get("skip_nvidia_overrides", False)
    vendor = gpu_cfg.get("vendor", "auto")

    nvidia_prefixes = (
        "libnvidia", "libcuda", "libEGL_nvidia", "libGLX_nvidia",
        "libGLES", "libvdpau_nvidia", "libnvcuvid", "libcudadebugger",
    )

    nvidia_needs_overrides = False
    x86_64_items = []
    i386_items = []

    if vendor == "nvidia" and not skip_nvidia:
        wine_arch = config.get("wine_arch", ["x86_64", "i386"])
        has_x86_64 = any(a in ("x86_64", "win64") for a in wine_arch)
        has_i386 = any(a in ("i386", "win32") for a in wine_arch)

        if has_x86_64:
            x86_64_items = _collect_nvidia_so(Path("/usr/lib"), nvidia_prefixes)
            if x86_64_items:
                nvidia_needs_overrides = True

        if has_i386:
            i386_items = _collect_nvidia_so(Path("/usr/lib32"), nvidia_prefixes)
            if i386_items:
                nvidia_needs_overrides = True

    # Cria --tmpfs /overrides UMA VEZ se qualquer override for necessário
    if icd_needs_overrides or nvidia_needs_overrides:
        args.insert(0, "--tmpfs")
        args.insert(1, "/overrides/lib")
        args.insert(0, "--tmpfs")
        args.insert(1, "/overrides")

    # Agora adiciona os binds do nvidia (se houver)
    if x86_64_items:
        _add_nvidia_bind(args, x86_64_items, "/overrides/lib")
    if i386_items:
        # /overrides/lib32 não precisa de --tmpfs separado porque
        # /overrides já é tmpfs; lib32 será criado dentro
        _add_nvidia_bind(args, i386_items, "/overrides/lib32")

    applied = len(args) > 0

    # Guarda paths detectados para o step env.py usar
    # Usa os paths de override se disponíveis (montados em /overrides/share/)
    gpu_info = {
        "vk_icd": icd_result.get("icd_overrides_path") or _detect_vk_icd(),
        "vk_implicit": _detect_vk_layers()[0],
        "vk_explicit": _detect_vk_layers()[1],
        "egl_vendor": icd_result.get("egl_overrides_dir") or _detect_egl_vendor(),
        "dri_path": _detect_dri(),
        "gbm_path": _detect_gbm(),
        "skip_nvidia": skip_nvidia,
    }

    summary_parts = []
    if icd_result.get("icd_rewritten", 0) > 0:
        summary_parts.append(f"icd_remap={icd_result['icd_rewritten']}")
    if icd_result.get("egl_rewritten", 0) > 0:
        summary_parts.append(f"egl_remap={icd_result['egl_rewritten']}")
    if skip_nvidia:
        summary_parts.append("nvidia_overrides=skip (bundled)")
    elif applied:
        summary_parts.append("nvidia_overrides=applied")
    else:
        summary_parts.append("nvidia_overrides=none")

    return StepResult(
        args=args,
        applied=applied or icd_result.get("icd_rewritten", 0) > 0 or icd_result.get("egl_rewritten", 0) > 0,
        summary=f"gpu: {', '.join(summary_parts)}",
        extra={"gpu_info": gpu_info},
    )


def _configure_from_capsule(args: list[str], config: dict, manifest) -> StepResult:
    """Configura GPU a partir do manifesto do container auxiliar."""
    from engine.container.capsule import get_bwrap_overrides_args

    log.info("GPU: usando capsule manifest (%d libs, %d ICDs, %d EGLs)",
             len(manifest.libs),
             len(manifest.rewritten_icds),
             len(manifest.rewritten_egls))

    capsule_args = get_bwrap_overrides_args(manifest)
    args.extend(capsule_args)

    gpu_info = dict(manifest.gpu_info) if manifest.gpu_info else {}

    summary_parts = []
    if manifest.vendors:
        summary_parts.append(f"vendor={','.join(manifest.vendors)}")
    if manifest.rewritten_icds:
        summary_parts.append(f"icd_remap={len(manifest.rewritten_icds)}")
    if manifest.rewritten_egls:
        summary_parts.append(f"egl_remap={len(manifest.rewritten_egls)}")
    if manifest.libs:
        summary_parts.append(f"libs={len(manifest.libs)}")
    if not summary_parts:
        summary_parts.append("no_overrides")

    gpu_info["skip_nvidia"] = config.get("gpu", {}).get("skip_nvidia_overrides", False)

    return StepResult(
        args=args,
        applied=len(capsule_args) > 0,
        summary=f"gpu: {', '.join(summary_parts)}",
        extra={"gpu_info": gpu_info},
    )
