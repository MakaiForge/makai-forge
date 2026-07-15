"""Montagem de overrides GPU no container bwrap.

Gera argumentos --ro-bind para adicionar ao build_bwrap_cmd().
"""

import os


def override_bwrap_args(
    overrides_base: str,
    arch: str = "x86_64-linux-gnu",
) -> list[str]:
    """Gera argumentos --ro-bind para montar overrides GPU.

    Monta:
      <overrides_base>/<arch>/lib -> /overrides/<arch>/lib
      <overrides_base>/share      -> /usr/share (ICDs JSON, etc.)

    LD_LIBRARY_PATH no container deve incluir /overrides/<arch>/lib
    com prioridade máxima para que estas libs sejam encontradas primeiro.

    Returns: lista de args para bwrap.
    """
    args = []

    lib_dir = os.path.join(overrides_base, arch, "lib")
    if os.path.isdir(lib_dir) and os.listdir(lib_dir):
        override_lib = f"/overrides/{arch}/lib"
        args.extend(["--ro-bind", lib_dir, override_lib])

    data_dir = os.path.join(overrides_base, "share")
    if os.path.isdir(data_dir):
        for root, dirs, files in os.walk(data_dir):
            for f in files:
                src = os.path.join(root, f)
                rel = os.path.relpath(src, overrides_base)
                dst = os.path.join("/", rel)
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
