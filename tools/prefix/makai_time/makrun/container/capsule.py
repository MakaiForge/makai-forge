"""
# =============================================================================
# Capsule — Container auxiliar para detecção de GPU.
#
# Sobe um bwrap com runtime + host, roda detecção DENTRO do container
# (como o capsule-capture-libs da Steam), e retorna um GPUManifest
# com as libs que precisam ser montadas no container real.
#
# Fluxo:
#   1. Sobe container auxiliar com:
#      - runtime steamrt4 em /usr
#      - host em /run/host
#      - /proc, /dev/dri, /dev/nvidia*
#      - /overrides como tmpfs (saída)
#   2. Roda detecção DENTRO do container:
#      - Lê JSONs ICD/EGL do host (/run/host/usr/share/...)
#      - Para cada library_path, verifica se runtime tem a lib
#      - Se runtime NÃO tem, copia do host para /overrides/
#      - Re-escreve JSONs com paths /overrides/
#      - Detecta libs NVIDIA/DRI/GBM/VDPAU/VAAPI faltantes
#      - Salva manifest.json em /overrides/
#   3. Lê manifest.json e retorna GPUManifest
# =============================================================================
"""

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from makrun.log import log

DETECT_SCRIPT_NAME = "makai-capsule-detect.py"


@dataclass
class GPUManifest:
    """Resultado da captura de GPU via container auxiliar."""
    libs: list[dict[str, str]] = field(default_factory=list)
    rewritten_icds: list[dict[str, str]] = field(default_factory=list)
    rewritten_egls: list[dict[str, str]] = field(default_factory=list)
    env_vars: dict[str, str] = field(default_factory=dict)
    gpu_info: dict[str, Any] = field(default_factory=dict)
    vendors: list[str] = field(default_factory=list)


def _generate_detect_script() -> str:
    """Gera script Python que roda DENTRO do container auxiliar."""
    return r'''#!/usr/bin/env python3
"""Capsule detect: roda dentro do container auxiliar.

Paths dentro do container:
  /usr             → runtime (steamrt4)
  /run/host        → sistema host real
  /overrides       → tmpfs de saída
"""
import json, os, shutil, subprocess, sys
from pathlib import Path

HOST = Path("/run/host")
OVERRIDES = Path("/overrides")
RUNTIME_LIB = Path("/usr/lib")
RUNTIME_LIB32 = Path("/lib")

def resolve_lib_ldconfig(soname: str) -> str | None:
    try:
        r = subprocess.run(
            ["/sbin/ldconfig", "-p"],
            capture_output=True, text=True, timeout=10,
            env={"LD_LIBRARY_PATH": "/lib:/usr/lib"},
        )
        for line in r.stdout.splitlines():
            line = line.strip()
            if " => " not in line:
                continue
            lib_part, path_part = line.split(" => ", 1)
            if lib_part == soname or lib_part.startswith(soname + " "):
                return path_part.strip()
    except Exception:
        pass
    return None

def lib_exists_in_runtime(lib_path: str) -> bool:
    if lib_path.startswith("/"):
        p = Path(lib_path)
    else:
        p = RUNTIME_LIB / lib_path
    if p.exists():
        return True
    p32 = RUNTIME_LIB32 / lib_path
    if p32.exists():
        return True
    resolved = resolve_lib_ldconfig(lib_path)
    if resolved:
        rp = Path(resolved)
        if str(rp).startswith("/usr/") or str(rp).startswith("/lib/"):
            return True
        if rp.exists():
            return True
    for base in [RUNTIME_LIB, RUNTIME_LIB32, RUNTIME_LIB / "x86_64-linux-gnu", RUNTIME_LIB32 / "i386-linux-gnu"]:
        if (base / lib_path).exists():
            return True
    return False

def find_host_lib(lib_path: str) -> Path | None:
    candidates = [
        HOST / lib_path.lstrip("/"),
        HOST / "usr/lib" / lib_path,
        HOST / "usr/lib/x86_64-linux-gnu" / lib_path,
        HOST / "usr/lib32" / lib_path,
        HOST / "lib" / lib_path,
        HOST / "lib/x86_64-linux-gnu" / lib_path,
        HOST / "lib32" / lib_path,
        HOST / "usr/lib/i386-linux-gnu" / lib_path,
        HOST / "lib/i386-linux-gnu" / lib_path,
    ]
    for c in candidates:
        if c.is_file() or c.is_symlink():
            return c
    return None

def ensure_override(lib_path: str, overrides_dir: str) -> str | None:
    lib_name = Path(lib_path).name
    dest = Path(OVERRIDES) / overrides_dir / lib_name
    if dest.exists():
        return str(dest)
    host_lib = find_host_lib(lib_path)
    if not host_lib:
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    if host_lib.is_symlink():
        target = os.readlink(str(host_lib))
        if not target.startswith("/"):
            target = str(host_lib.parent / target)
        os.symlink(target, str(dest))
    else:
        shutil.copy2(str(host_lib), str(dest))
    return str(dest)

def rewrite_json(host_json: Path, overrides_dir: str, lib_key: str = "library_path") -> dict | None:
    try:
        data = json.loads(host_json.read_text())
    except Exception:
        return None
    icd = data.get("ICD") or data.get("icd") or data
    lk = lib_key if lib_key in icd else "library_path"
    lib_val = icd.get(lk)
    if not lib_val:
        return None
    new_path = ensure_override(lib_val, overrides_dir)
    if not new_path:
        return None
    icd[lk] = new_path
    if "ICD" in data:
        data["ICD"] = icd
    elif "icd" in data:
        data["icd"] = icd
    return data

def detect_single_arch(host_lib_dir: Path, runtime_lib_dir: Path, overrides_dir: str, prefixes: tuple) -> list:
    items = []
    if not host_lib_dir.is_dir():
        return items
    for p in host_lib_dir.iterdir():
        if not any(p.name.startswith(pr) for pr in prefixes):
            continue
        if not (p.name.endswith(".so") or ".so." in p.name):
            continue
        rt_path = runtime_lib_dir / p.name
        if rt_path.is_file() or rt_path.is_symlink():
            continue
        dest = Path(OVERRIDES) / overrides_dir / p.name
        if dest.exists():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        if p.is_symlink():
            target = os.readlink(str(p))
            if not target.startswith("/"):
                target = str(p.parent / target)
            if target.startswith("/") and not target.startswith("/run/host"):
                target = str(HOST / target.lstrip("/"))
            if os.path.isfile(target):
                shutil.copy2(target, str(dest))
            else:
                os.symlink(target, str(dest))
        else:
            shutil.copy2(str(p), str(dest))
        items.append(p.name)
    return items

def main():
    result = {
        "libs": [],
        "rewritten_icds": [],
        "rewritten_egls": [],
        "env_vars": {},
        "gpu_info": {
            "vk_icd": None,
            "vk_implicit": None,
            "vk_explicit": None,
            "egl_vendor": None,
            "dri_path": None,
            "gbm_path": None,
        },
        "vendors": [],
    }

    OVERRIDES.mkdir(parents=True, exist_ok=True)
    (OVERRIDES / "lib").mkdir(parents=True, exist_ok=True)
    (OVERRIDES / "lib32").mkdir(parents=True, exist_ok=True)
    (OVERRIDES / "share").mkdir(parents=True, exist_ok=True)

    host_icd_dir = HOST / "usr/share/vulkan/icd.d"
    host_egl_dir = HOST / "usr/share/glvnd/egl_vendor.d"
    host_layer_implicit = HOST / "usr/share/vulkan/implicit_layer.d"
    host_layer_explicit = HOST / "usr/share/vulkan/explicit_layer.d"

    if host_icd_dir.is_dir():
        for jf in sorted(host_icd_dir.glob("*.json")):
            data = rewrite_json(jf, "lib")
            if data is None:
                continue
            rel = jf.relative_to(HOST / "usr/share")
            out_path = OVERRIDES / "share" / rel
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(data, indent=2))
            result["rewritten_icds"].append({
                "container_path": str(out_path),
                "content": json.dumps(data, indent=2),
            })
            if result["gpu_info"]["vk_icd"] is None:
                result["gpu_info"]["vk_icd"] = str(out_path)

    if host_egl_dir.is_dir():
        for jf in sorted(host_egl_dir.glob("*.json")):
            data = rewrite_json(jf, "lib")
            if data is None:
                continue
            rel = jf.relative_to(HOST / "usr/share")
            out_path = OVERRIDES / "share" / rel
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(data, indent=2))
            result["rewritten_egls"].append({
                "container_path": str(out_path),
                "content": json.dumps(data, indent=2),
            })
            result["gpu_info"]["egl_vendor"] = str(out_path.parent)

    host_vk_implicit = HOST / "usr/share/vulkan/implicit_layer.d"
    if host_vk_implicit.is_dir():
        overlays_implicit = OVERRIDES / "share/vulkan/implicit_layer.d"
        overlays_implicit.mkdir(parents=True, exist_ok=True)
        for jf in sorted(host_vk_implicit.glob("*.json")):
            data = rewrite_json(jf, "lib")
            if data is None:
                continue
            out_path = overlays_implicit / jf.name
            out_path.write_text(json.dumps(data, indent=2))
        result["gpu_info"]["vk_implicit"] = str(overlays_implicit)

    host_vk_explicit = HOST / "usr/share/vulkan/explicit_layer.d"
    if host_vk_explicit.is_dir():
        overlays_explicit = OVERRIDES / "share/vulkan/explicit_layer.d"
        overlays_explicit.mkdir(parents=True, exist_ok=True)
        for jf in sorted(host_vk_explicit.glob("*.json")):
            data = rewrite_json(jf, "lib")
            if data is None:
                continue
            out_path = overlays_explicit / jf.name
            out_path.write_text(json.dumps(data, indent=2))
        result["gpu_info"]["vk_explicit"] = str(overlays_explicit)

    dri_path = OVERRIDES / "lib/dri"
    gbm_path = OVERRIDES / "lib/gbm"
    dri_path.mkdir(parents=True, exist_ok=True)
    gbm_path.mkdir(parents=True, exist_ok=True)

    host_dri = HOST / "usr/lib/dri"
    if host_dri.is_dir():
        for f in host_dri.iterdir():
            if f.name.endswith("_dri.so") or f.name.endswith("_drv_video.so"):
                if not (RUNTIME_LIB / "dri" / f.name).exists():
                    dest = dri_path / f.name
                    if not dest.exists() and not (RUNTIME_LIB / "x86_64-linux-gnu/dri" / f.name).exists():
                        if f.is_symlink():
                            target = os.readlink(str(f))
                            if not target.startswith("/"):
                                target = str(f.parent / target)
                            if target.startswith("/") and not target.startswith("/run/host"):
                                real_target = str(HOST / target.lstrip("/"))
                                if os.path.isfile(real_target):
                                    shutil.copy2(real_target, str(dest))
                                else:
                                    os.symlink(target, str(dest))
                            else:
                                os.symlink(target, str(dest))
                        else:
                            shutil.copy2(str(f), str(dest))
                        result["libs"].append({"name": f.name, "src": str(f), "dest": str(dest)})

    host_gbm = HOST / "usr/lib/gbm"
    if host_gbm.is_dir():
        for f in host_gbm.iterdir():
            if f.suffix == ".so":
                if not (RUNTIME_LIB / "gbm" / f.name).exists():
                    dest = gbm_path / f.name
                    if not dest.exists():
                        if f.is_symlink():
                            target = os.readlink(str(f))
                            if not target.startswith("/"):
                                target = str(f.parent / target)
                            if target.startswith("/") and not target.startswith("/run/host"):
                                real_target = str(HOST / target.lstrip("/"))
                                if os.path.isfile(real_target):
                                    shutil.copy2(real_target, str(dest))
                                else:
                                    os.symlink(target, str(dest))
                            else:
                                os.symlink(target, str(dest))
                        else:
                            shutil.copy2(str(f), str(dest))
                        result["libs"].append({"name": f.name, "src": str(f), "dest": str(dest)})

    result["gpu_info"]["dri_path"] = str(dri_path)
    result["gpu_info"]["gbm_path"] = str(gbm_path)

    nvidia_prefixes = (
        "libnvidia", "libcuda", "libEGL_nvidia", "libGLX_nvidia",
        "libGLES", "libvdpau_nvidia", "libnvcuvid", "libcudadebugger",
    )

    host_lib64 = HOST / "usr/lib/x86_64-linux-gnu"
    host_lib32 = HOST / "usr/lib32"
    host_lib = HOST / "usr/lib"
    runtime_lib64 = RUNTIME_LIB / "x86_64-linux-gnu"
    runtime_lib32 = Path("/lib/i386-linux-gnu")

    nv64 = detect_single_arch(host_lib64, runtime_lib64, "lib", nvidia_prefixes)
    if not nv64:
        nv64 = detect_single_arch(host_lib, runtime_lib64, "lib", nvidia_prefixes)
    # Adiciona libs NVIDIA ao result["libs"] para bind-mount no host
    _nv_lib_dir = OVERRIDES / "lib"
    for _name in nv64:
        _src = (host_lib64 / _name) if (host_lib64 / _name).exists() else (host_lib / _name)
        _dst = _nv_lib_dir / _name
        if _dst.exists() and _src.exists():
            result["libs"].append({"name": _name, "src": str(_src), "dest": str(_dst)})

    nv32 = []
    if host_lib32.is_dir():
        nv32 = detect_single_arch(host_lib32, runtime_lib32, "lib32", nvidia_prefixes)
    _nv32_lib_dir = OVERRIDES / "lib32"
    for _name in nv32:
        _src = host_lib32 / _name
        _dst = _nv32_lib_dir / _name
        if _dst.exists() and _src.exists():
            result["libs"].append({"name": _name, "src": str(_src), "dest": str(_dst)})

    if nv64 or nv32:
        result["vendors"].append("nvidia")

    if not result["vendors"]:
        for maybe in ["radeon", "amd", "intel", "mesa"]:
            if HOST / f"usr/lib/x86_64-linux-gnu/lib{maybe}" in [p.parent for p in host_lib64.glob(f"lib{maybe}*")]:
                result["vendors"].append(maybe)
                break

    env = {}
    if result["gpu_info"]["vk_icd"]:
        env["VK_ICD_FILENAMES"] = result["gpu_info"]["vk_icd"]
        env["VK_DRIVER_FILES"] = result["gpu_info"]["vk_icd"]
    if result["gpu_info"]["vk_implicit"]:
        env["VK_IMPLICIT_LAYER_PATH"] = result["gpu_info"]["vk_implicit"]
    if result["gpu_info"]["vk_explicit"]:
        env["VK_LAYER_PATH"] = result["gpu_info"]["vk_explicit"]
    if result["gpu_info"]["egl_vendor"]:
        env["__EGL_VENDOR_LIBRARY_FILENAMES"] = f"{result['gpu_info']['egl_vendor']}/10_nvidia.json"
    if result["gpu_info"]["dri_path"]:
        env["LIBGL_DRIVERS_PATH"] = result["gpu_info"]["dri_path"]
    if result["gpu_info"]["gbm_path"]:
        env["GBM_BACKENDS_PATH"] = result["gpu_info"]["gbm_path"]
    env["__GLX_VENDOR_LIBRARY_NAME"] = "nvidia" if "nvidia" in result["vendors"] else "mesa"
    result["env_vars"] = env

    # output JSON para stdout (capturado pelo host)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
'''


def _build_aux_cmd(
    runtime_files: Path,
    detect_script_path: Path,
    gpu_config: dict,
) -> list[str]:
    """Monta comando bwrap para o container auxiliar."""
    cmd = ["bwrap"]

    cmd.extend(["--ro-bind", str(runtime_files / "usr"), "/usr"])
    cmd.extend(["--tmpfs", "/lib"])
    runtime_lib = runtime_files / "lib"
    for _ld in ["x86_64-linux-gnu", "i386-linux-gnu"]:
        _src = runtime_lib / _ld
        if _src.is_dir():
            cmd.extend(["--ro-bind", str(_src), f"/lib/{_ld}"])
    if (runtime_lib / "i386-linux-gnu" / "ld-linux.so.2").is_file():
        cmd.extend(["--symlink", "i386-linux-gnu/ld-linux.so.2", "/lib/ld-linux.so.2"])
    cmd.extend(["--symlink", "lib/x86_64-linux-gnu", "/lib64"])
    if (runtime_lib / "i386-linux-gnu").is_dir():
        cmd.extend(["--symlink", "lib/i386-linux-gnu", "/lib32"])
    for link in ["bin", "sbin"]:
        cmd.extend(["--symlink", f"usr/{link}", f"/{link}"])

    cmd.extend(["--ro-bind", "/", "/run/host"])
    cmd.extend(["--proc", "/proc"])
    cmd.extend(["--tmpfs", "/tmp"])
    cmd.extend(["--tmpfs", "/overrides"])

    dev_cfg = gpu_config.get("devices", {})
    if dev_cfg.get("bind_dri", True):
        dri = Path("/dev/dri")
        if dri.is_dir():
            cmd.extend(["--dev-bind", "/dev/dri", "/dev/dri"])
    if dev_cfg.get("bind_nvidia", True):
        for dev in ["nvidia0", "nvidiactl", "nvidia-modeset", "nvidia-uvm"]:
            d = Path(f"/dev/{dev}")
            if d.exists():
                cmd.extend(["--dev-bind", str(d), str(d)])
    for dev in ["urandom", "random", "null", "zero", "full", "pts", "ptmx"]:
        d = Path(f"/dev/{dev}")
        if d.exists():
            cmd.extend(["--dev-bind", str(d), str(d)])

    cmd.extend(["--clearenv"])
    cmd.extend(["--setenv", "PATH", "/usr/bin:/usr/sbin:/bin:/sbin"])
    cmd.extend(["--setenv", "LD_LIBRARY_PATH", "/lib:/usr/lib:/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu"])
    cmd.extend(["--setenv", "HOME", "/root"])

    runtime_python = runtime_files / "usr/bin/python3"
    if runtime_python.is_file():
        cmd.extend(["--ro-bind", str(detect_script_path), f"/{DETECT_SCRIPT_NAME}"])
        # python3 está em /usr/bin/python3 dentro do container
        cmd.extend(["/usr/bin/python3", f"/{DETECT_SCRIPT_NAME}"])
    else:
        cmd.extend(["/usr/bin/python3", str(detect_script_path)])

    return cmd


def capture_gpu_libs(
    runtime_path: Path,
    gpu_config: dict | None = None,
) -> GPUManifest:
    """Sobe container auxiliar e captura libs GPU.

    Args:
        runtime_path: Caminho para o runtime (makai-time-platform-1.0).
        gpu_config: Config GPU do fork (opcional, usa defaults se None).

    Returns:
        GPUManifest com libs capturadas + JSONs reescritos.
    """
    if gpu_config is None:
        gpu_config = {"devices": {"bind_dri": True, "bind_nvidia": True}}

    runtime_files = runtime_path / "files"
    if not (runtime_files / "usr").is_dir():
        raise RuntimeError(f"Runtime sem files/usr em {runtime_path}")

    detect_script = _generate_detect_script()

    script_path = Path(tempfile.mktemp(prefix="makai-capsule-", suffix=".py"))
    try:
        script_path.write_text(detect_script)
        script_path.chmod(0o755)

        aux_cmd = _build_aux_cmd(runtime_files, script_path, gpu_config)

        log.info("=== Capsule: subindo container auxiliar ===")
        log.debug("Comando: %s", " ".join(str(c) for c in aux_cmd[:10]) + "...")

        r = subprocess.run(
            aux_cmd,
            capture_output=True, text=True, timeout=120,
        )

        if r.returncode != 0:
            log.warning("Capsule aux container exit code: %d", r.returncode)
            log.debug("Capsule stderr: %s", r.stderr[:2000] if r.stderr else "(none)")

        # Parse JSON do stdout
        raw = r.stdout.strip()
        if raw:
            try:
                data = json.loads(raw)
                manifest = GPUManifest(
                    libs=data.get("libs", []),
                    rewritten_icds=data.get("rewritten_icds", []),
                    rewritten_egls=data.get("rewritten_egls", []),
                    env_vars=data.get("env_vars", {}),
                    gpu_info=data.get("gpu_info", {}),
                    vendors=data.get("vendors", []),
                )
                log.info("Capsule: %d libs, %d ICDs, %d EGLs, vendor=%s",
                         len(manifest.libs),
                         len(manifest.rewritten_icds),
                         len(manifest.rewritten_egls),
                         manifest.vendors or "?")
                return manifest
            except json.JSONDecodeError as e:
                log.warning("Capsule: stdout não é JSON válido: %s", e)
                log.debug("Capsule stdout: %s", r.stdout[:2000])

        log.warning("Capsule: sem output JSON no stdout")
        return GPUManifest()

    except subprocess.TimeoutExpired:
        log.error("Capsule: timeout (120s)")
        return GPUManifest()
    except Exception as e:
        log.error("Capsule: erro: %s", e)
        return GPUManifest()
    finally:
        if script_path.exists():
            script_path.unlink(missing_ok=True)


def _rewrite_gpu_json(src_path: Path, new_prefix: str = "/run/host") -> dict | None:
    """Reescreve paths de lib num JSON de ICD/EGL/layer Vulkan para usar /run/host."""
    try:
        data = json.loads(src_path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    changed = False
    for container_key in ("icd", "ICD", "layer", "Layer"):
        entries = data.get(container_key, [])
        if isinstance(entries, dict):
            entries = [entries]
        for entry in entries if isinstance(entries, list) else []:
            for key in ("library_path", "path"):
                if key in entry:
                    old = entry[key]
                    if isinstance(old, str) and not old.startswith("/run/host"):
                        entry[key] = new_prefix + old
                        changed = True
    if not changed:
        for key in ("library_path", "path"):
            if key in data:
                old = data[key]
                if isinstance(old, str) and not old.startswith("/run/host"):
                    data[key] = new_prefix + old
                    changed = True
                    break
    return data if changed else None


def get_bwrap_overrides_args(manifest: GPUManifest) -> list[str]:
    """Gera args bwrap para montar os overrides do capsule."""
    args = []

    if not manifest.libs and not manifest.rewritten_icds and not manifest.rewritten_egls:
        return args

    overrides_tmp = Path(tempfile.mkdtemp(prefix="makai-overrides-"))

    args.extend(["--tmpfs", "/overrides"])
    for subdir in ["lib", "lib32", "share"]:
        args.extend(["--tmpfs", f"/overrides/{subdir}"])

    for lib in manifest.libs:
        src = lib.get("src", "")
        dst = lib.get("dest", "")
        if src and dst:
            host_src = src.replace("/run/host", "", 1) if src.startswith("/run/host") else src
            host_src_path = Path(host_src)
            if host_src_path.exists():
                args.extend(["--ro-bind", host_src, dst])
            else:
                log.warning("Capsule: lib %s não existe no host, pulando", host_src)

    icd_tmp = overrides_tmp / "share/vulkan/icd.d"
    icd_tmp.mkdir(parents=True, exist_ok=True)
    for icd in manifest.rewritten_icds:
        cp = icd.get("container_path", "")
        content = icd.get("content", "")
        if cp and content:
            dest = icd_tmp / Path(cp).name
            dest.write_text(content)
            args.extend(["--ro-bind", str(dest), cp])

    egl_tmp = overrides_tmp / "share/glvnd/egl_vendor.d"
    egl_tmp.mkdir(parents=True, exist_ok=True)
    for egl in manifest.rewritten_egls:
        cp = egl.get("container_path", "")
        content = egl.get("content", "")
        if cp and content:
            dest = egl_tmp / Path(cp).name
            dest.write_text(content)
            args.extend(["--ro-bind", str(dest), cp])

    if manifest.gpu_info.get("vk_implicit"):
        imp_path = manifest.gpu_info["vk_implicit"]
        imp_tmp = overrides_tmp / "share/vulkan/implicit_layer.d"
        imp_tmp.mkdir(parents=True, exist_ok=True)
        host_imp = Path("/usr/share/vulkan/implicit_layer.d")
        if host_imp.is_dir():
            for jf in sorted(host_imp.glob("*.json")):
                data = _rewrite_gpu_json(jf)
                if data:
                    dest = imp_tmp / jf.name
                    dest.write_text(json.dumps(data, indent=2))
            if any(imp_tmp.iterdir()):
                args.extend(["--ro-bind", str(imp_tmp), imp_path])

    if manifest.gpu_info.get("vk_explicit"):
        exp_path = manifest.gpu_info["vk_explicit"]
        exp_tmp = overrides_tmp / "share/vulkan/explicit_layer.d"
        exp_tmp.mkdir(parents=True, exist_ok=True)
        host_exp = Path("/usr/share/vulkan/explicit_layer.d")
        if host_exp.is_dir():
            for jf in sorted(host_exp.glob("*.json")):
                data = _rewrite_gpu_json(jf)
                if data:
                    dest = exp_tmp / jf.name
                    dest.write_text(json.dumps(data, indent=2))
            if any(exp_tmp.iterdir()):
                args.extend(["--ro-bind", str(exp_tmp), exp_path])

    return args
