from pathlib import Path
from engine.container.steps import StepResult


def configure(config: dict) -> StepResult:
    """Configura /etc: nsswitch, hosts, resolv, machine-id, timezone."""
    args = []

    # nsswitch.conf sintético
    nss_path = Path("/tmp/.makrun-nsswitch.conf")
    if not nss_path.exists():
        nss_path.write_text(
            "passwd: files\n"
            "group: files\n"
            "shadow: files\n"
            "hosts: files dns\n"
            "networks: files\n"
            "protocols: files\n"
            "services: files\n"
            "netgroup: files\n"
        )
    args.extend(["--ro-bind", str(nss_path), "/etc/nsswitch.conf"])

    # Arquivos do /etc do host
    for etc_file in ["hosts", "host.conf", "resolv.conf", "services",
                      "group", "passwd"]:
        host_etc = Path("/etc") / etc_file
        if host_etc.is_file():
            args.extend(["--ro-bind", str(host_etc), f"/etc/{etc_file}"])

    # machine-id (D-Bus, PulseAudio)
    machine_id = Path("/etc/machine-id")
    if machine_id.is_file():
        args.extend(["--ro-bind", str(machine_id), "/etc/machine-id"])

    # timezone
    localtime = Path("/etc/localtime")
    if localtime.is_file() or localtime.is_symlink():
        args.extend(["--ro-bind", str(localtime), "/etc/localtime"])

    # fontconfig (/etc/fonts)
    fonts_etc = Path("/etc/fonts")
    if fonts_etc.is_dir():
        args.extend(["--ro-bind", str(fonts_etc), "/etc/fonts"])

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary="etc: nsswitch, hosts, resolv, machine-id, timezone",
    )
