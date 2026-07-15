"""Montagem de overrides GPU no container bwrap.

Gera argumentos --ro-bind para adicionar ao build_bwrap_cmd().
"""

import os


def override_bwrap_args(
    overrides_base: str,
    arch: str = "x86_64-linux-gnu",
) -> list[str]:
    """Gera argumentos --ro-bind para montar overrides GPU.

    Monta o diretório inteiro de overrides em /overrides (inclui libs),
    e binda ICDs JSON individualmente em /usr/share/vulkan/icd.d/.

    LD_LIBRARY_PATH no container deve incluir /overrides/<arch>/lib
    com prioridade máxima para que estas libs sejam encontradas primeiro.

    Returns: lista de args para bwrap.
    """
    args = []

    # Binda o diretório inteiro de overrides — cobre libs de todas as archs
    if os.path.isdir(overrides_base):
        args.extend(["--ro-bind", overrides_base, "/overrides"])

    # Binda ICDs JSON para /usr/share/vulkan/icd.d/ (Vulkan loader path)
    icd_dir = os.path.join(overrides_base, "share", "vulkan", "icd.d")
    if os.path.isdir(icd_dir):
        for f in sorted(os.listdir(icd_dir)):
            src = os.path.join(icd_dir, f)
            if os.path.isfile(src):
                dst = f"/usr/share/vulkan/icd.d/{f}"
                args.extend(["--ro-bind", src, dst])

    return args


def gpu_device_args() -> list[str]:
    """Gera argumentos --dev-bind para dispositivos GPU."""
    args = []
    drm_path = "/dev/dri"
    if os.path.isdir(drm_path):
        args.extend(["--dev-bind", drm_path, drm_path])

    for dev in ["/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-modeset"]:
        if os.path.exists(dev):
            args.extend(["--dev-bind", dev, dev])

    if os.path.exists("/dev/nvidia-uvm"):
        args.extend(["--dev-bind", "/dev/nvidia-uvm", "/dev/nvidia-uvm"])

    return args
