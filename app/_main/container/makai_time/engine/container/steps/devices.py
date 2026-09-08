from pathlib import Path
from engine.container.steps import StepResult


def configure(config: dict) -> StepResult:
    """Monta /dev: GPU, áudio, NTSYNC, udev."""
    args = []
    dev_cfg = config.get("devices", {})

    # DRI (GPU render)
    if dev_cfg.get("bind_dri", True):
        dri = Path("/dev/dri")
        if dri.is_dir():
            args.extend(["--dev-bind", "/dev/dri", "/dev/dri"])

    # NVIDIA
    if dev_cfg.get("bind_nvidia", True):
        for dev in ["nvidia0", "nvidiactl", "nvidia-modeset", "nvidia-uvm"]:
            d = Path(f"/dev/{dev}")
            if d.exists():
                args.extend(["--dev-bind", str(d), str(d)])

    # ALSA /dev/snd
    if dev_cfg.get("bind_snd", False):
        snd = Path("/dev/snd")
        if snd.is_dir():
            args.extend(["--dev-bind", "/dev/snd", "/dev/snd"])

    # NTSYNC (kernel 6.14+)
    if dev_cfg.get("bind_ntsync", False):
        ntsync = Path("/dev/ntsync")
        if ntsync.exists():
            args.extend(["--dev-bind", "/dev/ntsync", "/dev/ntsync"])

    # /dev/shm
    if dev_cfg.get("bind_shm", True):
        args.extend(["--bind", "/dev/shm", "/dev/shm"])

    # /run/udev
    if dev_cfg.get("bind_udev", True):
        udev = Path("/run/udev")
        if udev.is_dir():
            args.extend(["--ro-bind", "/run/udev", "/run/udev"])

    # Devices essenciais
    for dev in ["urandom", "random", "null", "zero", "full"]:
        d = Path(f"/dev/{dev}")
        if d.exists():
            args.extend(["--dev-bind", str(d), str(d)])

    # Binds adicionais
    for extra in dev_cfg.get("extra_binds", []):
        if ":" in extra:
            src, dst = extra.split(":", 1)
            p = Path(src)
            if p.exists():
                args.extend(["--ro-bind", src, dst])

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary=f"devices: snd={dev_cfg.get('bind_snd', False)}, "
                f"ntsync={dev_cfg.get('bind_ntsync', False)}, "
                f"nvidia={dev_cfg.get('bind_nvidia', True)}",
    )
