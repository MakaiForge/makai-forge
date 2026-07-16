"""GPU library detection on the host system.

Varre o sistema host por bibliotecas GPU necessárias para o container:
- Vulkan ICDs (nvidia_icd.json, mesa_icd.json)
- EGL/GLX (libEGL, libGL, libGLX)
- DRI drivers (*_dri.so)
- VA-API drivers (*_drv_video.so)
- VDPAU drivers (*.so)
- libdrm, libgbm
- libnvidia-*, libcuda*
- OpenXR JSONs runtime + layers

Inspirado em pressure-vessel: SrtGraphicsProvider + collect_graphics_libraries_patterns.
"""

import json
import os
import re


HOST_LIB_PATHS = [
    "/usr/lib/x86_64-linux-gnu",
    "/usr/lib/i386-linux-gnu",
    "/usr/lib64",
    "/usr/lib",
    "/lib/x86_64-linux-gnu",
    "/lib/i386-linux-gnu",
    "/lib64",
    "/lib",
]

HOST_DATA_PATHS = [
    "/usr/share",
    "/usr/local/share",
]


def _find_lib(filename: str) -> str | None:
    """Busca uma biblioteca nos paths padrão do host."""
    for p in HOST_LIB_PATHS:
        full = os.path.join(p, filename)
        if os.path.isfile(full):
            return full
    return None


def _find_libs(pattern: str) -> list[str]:
    """Busca múltiplas bibliotecas por padrão glob-like."""
    results = []
    for p in HOST_LIB_PATHS:
        if not os.path.isdir(p):
            continue
        try:
            for f in os.listdir(p):
                if re.match(pattern, f):
                    results.append(os.path.join(p, f))
        except OSError:
            continue
    return results


def vulkan_icds() -> list[dict]:
    """Detecta ICDs Vulkan do host.
    
    Lê arquivos nvidia_icd.json, mesa_icd.json, etc.
    Returns lista de {"json_path": str, "lib_path": str, "vendor": str}.
    """
    icds = []
    for data_dir in HOST_DATA_PATHS:
        vulkan_dir = os.path.join(data_dir, "vulkan", "icd.d")
        if not os.path.isdir(vulkan_dir):
            continue
        try:
            for fname in os.listdir(vulkan_dir):
                if not fname.endswith(".json"):
                    continue
                json_path = os.path.join(vulkan_dir, fname)
                try:
                    with open(json_path) as f:
                        data = json.load(f)
                    if "ICD" in data and "library_path" in data["ICD"]:
                        lib_path = data["ICD"]["library_path"]
                        if not os.path.isabs(lib_path):
                            lib_path = _find_lib(lib_path)
                        vendor = "nvidia" if "nvidia" in fname.lower() else \
                                 "amd" if "amd" in fname.lower() or "radeon" in fname.lower() or "mesa" in fname.lower() else \
                                 "intel" if "intel" in fname.lower() else \
                                 "unknown"
                        icds.append({
                            "json_path": json_path,
                            "lib_path": lib_path,
                            "vendor": vendor,
                        })
                except (json.JSONDecodeError, OSError):
                    continue
        except OSError:
            continue
    return icds


def vulkan_layers() -> list[str]:
    """Detecta camadas Vulkan (VK_LAYER_PATH)."""
    layers = []
    for data_dir in HOST_DATA_PATHS:
        layer_dir = os.path.join(data_dir, "vulkan", "implicit_layer.d")
        if not os.path.isdir(layer_dir):
            continue
        try:
            for fname in os.listdir(layer_dir):
                if not fname.endswith(".json"):
                    continue
                json_path = os.path.join(layer_dir, fname)
                try:
                    with open(json_path) as f:
                        data = json.load(f)
                    if "layer" in data and "library_path" in data["layer"]:
                        layers.append(data["layer"]["library_path"])
                except (json.JSONDecodeError, OSError):
                    continue
        except OSError:
            continue
    return layers


def gl_drivers() -> dict[str, str | None]:
    """Detecta libGL, libGLX, libEGL."""
    return {
        "libGL.so.1": _find_lib("libGL.so.1"),
        "libGLX.so.0": _find_lib("libGLX.so.0"),
        "libGLX_mesa.so.0": _find_lib("libGLX_mesa.so.0"),
        "libGLX_nvidia.so.0": _find_lib("libGLX_nvidia.so.0"),
        "libEGL.so.1": _find_lib("libEGL.so.1"),
        "libEGL_mesa.so.0": _find_lib("libEGL_mesa.so.0"),
        "libEGL_nvidia.so.0": _find_lib("libEGL_nvidia.so.0"),
        "libGLdispatch.so.0": _find_lib("libGLdispatch.so.0"),
    }


def dri_drivers() -> list[str]:
    """Detecta drivers DRI (*_dri.so)."""
    return _find_libs(r".*_dri\.so$")


def vaapi_drivers() -> list[str]:
    """Detecta drivers VA-API (*_drv_video.so)."""
    return _find_libs(r".*_drv_video\.so$")


def vdpau_drivers() -> list[str]:
    """Detecta drivers VDPAU (*.so em /usr/lib/vdpau/ ou similar)."""
    vdpau_paths = ["/usr/lib/vdpau", "/usr/lib/x86_64-linux-gnu/vdpau"]
    drivers = []
    for p in vdpau_paths:
        if not os.path.isdir(p):
            continue
        try:
            for f in os.listdir(p):
                if f.endswith(".so"):
                    drivers.append(os.path.join(p, f))
        except OSError:
            continue
    return drivers


def nvidia_libs() -> list[str]:
    """Detecta bibliotecas proprietárias NVIDIA."""
    patterns = [
        r"libnvidia-(?!ml).*\.so.*",
        r"libcuda\.so.*",
        r"libnvcuvid\.so.*",
        r"libnvidia-encode\.so.*",
        r"libnvidia-opticalflow\.so.*",
        r"libnvidia-ml\.so.*",
    ]
    libs = []
    for p in HOST_LIB_PATHS:
        if not os.path.isdir(p):
            continue
        try:
            for f in os.listdir(p):
                for pat in patterns:
                    if re.match(pat, f):
                        full = os.path.join(p, f)
                        if full not in libs:
                            libs.append(full)
                        break
        except OSError:
            continue
    return libs


def drm_libs() -> list[str]:
    """Detecta libdrm + libgbm."""
    patterns = [
        r"libdrm.*\.so.*",
        r"libgbm.*\.so.*",
    ]
    libs = []
    for p in HOST_LIB_PATHS:
        if not os.path.isdir(p):
            continue
        try:
            for f in os.listdir(p):
                for pat in patterns:
                    if re.match(pat, f):
                        full = os.path.join(p, f)
                        if full not in libs:
                            libs.append(full)
                        break
        except OSError:
            continue
    return libs


def openxr_runtimes() -> list[dict]:
    """Detecta OpenXR runtimes e layers."""
    runtimes = []
    for data_dir in HOST_DATA_PATHS:
        xr_dir = os.path.join(data_dir, "openxr", "1", "api_layers")
        if not os.path.isdir(xr_dir):
            continue
        try:
            for fname in os.listdir(xr_dir):
                if not fname.endswith(".json"):
                    continue
                json_path = os.path.join(xr_dir, fname)
                try:
                    with open(json_path) as f:
                        data = json.load(f)
                    if "library_path" in data:
                        runtimes.append({
                            "json_path": json_path,
                            "lib_path": data["library_path"],
                        })
                except (json.JSONDecodeError, OSError):
                    continue
        except OSError:
            continue
    return runtimes


def gbm_drivers() -> list[str]:
    """Detecta GBM backend drivers (*.so em /usr/lib/gbm/)."""
    gbm_paths = ["/usr/lib/gbm", "/usr/lib/x86_64-linux-gnu/gbm"]
    drivers = []
    for p in gbm_paths:
        if not os.path.isdir(p):
            continue
        try:
            for f in os.listdir(p):
                if f.endswith(".so"):
                    drivers.append(os.path.join(p, f))
        except OSError:
            continue
    return drivers


def egl_vendors() -> list[str]:
    """Detecta EGL vendors via glvnd JSONs (/usr/share/glvnd/egl_*.json).
    
    Retorna lista de library_path extraídos dos JSONs.
    """
    glvnd_paths = ["/usr/share/glvnd", "/usr/local/share/glvnd"]
    libs = []
    for base in glvnd_paths:
        egl_dir = os.path.join(base, "egl_vendor.d")
        if not os.path.isdir(egl_dir):
            continue
        try:
            for fname in os.listdir(egl_dir):
                if not fname.endswith(".json"):
                    continue
                json_path = os.path.join(egl_dir, fname)
                try:
                    with open(json_path) as f:
                        data = json.load(f)
                    lib = data.get("file", data.get("library_path", ""))
                    if lib:
                        if not os.path.isabs(lib):
                            found = _find_lib(lib)
                            if found:
                                libs.append(found)
                        elif os.path.isfile(lib):
                            libs.append(lib)
                except (json.JSONDecodeError, OSError):
                    continue
        except OSError:
            continue
    return libs


def all_graphics_libraries() -> list[str]:
    """Retorna lista completa de todas as bibliotecas gráficas detectadas."""
    libs = []

    for name, path in gl_drivers().items():
        if path:
            libs.append(path)

    libs.extend(dri_drivers())
    libs.extend(vaapi_drivers())
    libs.extend(vdpau_drivers())
    libs.extend(nvidia_libs())
    libs.extend(drm_libs())
    libs.extend(gbm_drivers())
    libs.extend(egl_vendors())
    libs.extend(vulkan_layers())

    for xr in openxr_runtimes():
        if xr["lib_path"] and xr["lib_path"] not in libs:
            libs.append(xr["lib_path"])

    for icd in vulkan_icds():
        if icd["lib_path"] and icd["lib_path"] not in libs:
            libs.append(icd["lib_path"])

    return list(set(libs))


def resolve_symlinks(paths: list[str]) -> dict[str, str]:
    """Resolve symlinks: retorna dict {caminho_resolvido: caminho_original}.
    
    Útil para criar symlinks nos overrides apontando para o resolved target.
    """
    result = {}
    for p in paths:
        if os.path.islink(p):
            target = os.path.realpath(p)
            result[target] = p
        else:
            result[p] = p
    return result
