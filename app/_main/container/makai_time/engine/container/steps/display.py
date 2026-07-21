import os
from pathlib import Path
from engine.container.steps import StepResult


def configure(config: dict) -> StepResult:
    """Configura display: X11, Wayland, D-Bus, Discord."""
    args = []
    display_cfg = config.get("display", {})
    run_user = Path(f"/run/user/{os.getuid()}")

    # X11
    if display_cfg.get("bind_x11", True):
        x11_socket = Path("/tmp/.X11-unix")
        if x11_socket.is_dir():
            args.extend(["--ro-bind", "/tmp/.X11-unix", "/tmp/.X11-unix"])

    # Wayland
    if display_cfg.get("bind_wayland", True):
        wayland_display = display_cfg.get("wayland_display",
                                          os.environ.get("WAYLAND_DISPLAY", "wayland-0"))
        wayland_socket = run_user / wayland_display
        if wayland_socket.is_socket():
            args.extend(["--ro-bind", str(wayland_socket), str(wayland_socket)])

    # D-Bus
    if display_cfg.get("bind_dbus", True):
        dbus_socket = run_user / "bus"
        if dbus_socket.is_socket():
            args.extend(["--ro-bind", str(dbus_socket), str(dbus_socket)])

    # Discord IPC
    if display_cfg.get("bind_discord", True):
        if run_user.is_dir():
            for sock in sorted(run_user.glob("discord-ipc-*")):
                if sock.is_socket():
                    args.extend(["--bind", str(sock), str(sock)])

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary=f"display: x11={display_cfg.get('bind_x11', True)}, "
                f"wayland={display_cfg.get('bind_wayland', True)}",
    )
